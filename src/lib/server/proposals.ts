import { query } from "./db";
import { ActionError, movePlayer, type Actor } from "./actions";
import { FORCE_AFTER_MS, type ProposalOp } from "../proposal-ops";

export type { ProposalOp };

interface ProposalRow {
  id: string;
  player_id: string;
  from_table: number;
  from_seat: number;
  to_table: number;
  to_seat: number;
  proposed_at: Date;
  from_confirmed_at: Date | null;
  to_confirmed_at: Date | null;
  status: string;
}

async function captainOf(tournamentId: string, tableNumber: number): Promise<string | null> {
  const [row] = await query<{ captain_player_id: string | null }>(
    `select captain_player_id from tables where tournament_id = $1 and table_number = $2`,
    [tournamentId, tableNumber],
  );
  return row?.captain_player_id ?? null;
}

/**
 * Who speaks for a table. An unclaimed table's confirmer is the host, which is what
 * guarantees a move always has exactly two confirmers and can never deadlock.
 *
 * The host deliberately cannot confirm on a *claimed* table's behalf — overriding a
 * captain who is sitting right there is what `force` is for, and that waits 60s.
 */
async function canConfirmFor(
  tournamentId: string,
  actor: Actor,
  tableNumber: number,
): Promise<boolean> {
  const captain = await captainOf(tournamentId, tableNumber);
  if (captain === null) {
    return actor.isOwner;
  }
  return actor.playerId === captain;
}

async function loadProposal(tournamentId: string, id: string): Promise<ProposalRow> {
  const [row] = await query<ProposalRow>(
    `select id, player_id, from_table, from_seat, to_table, to_seat, proposed_at,
            from_confirmed_at, to_confirmed_at, status
     from proposals where tournament_id = $1 and id = $2`,
    [tournamentId, id],
  );
  if (!row) {
    throw new ActionError("Proposal not found", 404);
  }
  return row;
}

async function applyIfBothConfirmed(tournamentId: string, id: string): Promise<void> {
  const proposal = await loadProposal(tournamentId, id);
  if (proposal.status !== "pending") {
    return;
  }
  if (!proposal.from_confirmed_at || !proposal.to_confirmed_at) {
    return;
  }
  await movePlayer(tournamentId, proposal.player_id, proposal.to_table, proposal.to_seat);
  await query(`update proposals set status = 'applied' where id = $1`, [id]);
}

export async function applyProposalOp(
  tournamentId: string,
  actor: Actor,
  operation: ProposalOp,
): Promise<void> {
  switch (operation.op) {
    case "create": {
      const mayPropose =
        actor.isOwner ||
        (await canConfirmFor(tournamentId, actor, operation.fromTable)) ||
        (await canConfirmFor(tournamentId, actor, operation.toTable));
      if (!mayPropose) {
        throw new ActionError("Only a captain or the host can propose a move", 403);
      }

      const [existing] = await query<{ id: string }>(
        `select id from proposals
         where tournament_id = $1 and player_id = $2 and status = 'pending'`,
        [tournamentId, operation.playerId],
      );
      if (existing) {
        throw new ActionError("That player already has a move pending", 409);
      }

      // The proposer's own side counts as confirmed — nobody confirms twice.
      const fromConfirmed = await canConfirmFor(tournamentId, actor, operation.fromTable);
      const toConfirmed = await canConfirmFor(tournamentId, actor, operation.toTable);

      await query(
        `insert into proposals
           (tournament_id, player_id, from_table, from_seat, to_table, to_seat,
            from_confirmed_at, to_confirmed_at)
         values ($1, $2, $3, $4, $5, $6,
                 case when $7 then now() end, case when $8 then now() end)`,
        [
          tournamentId,
          operation.playerId,
          operation.fromTable,
          operation.fromSeat,
          operation.toTable,
          operation.toSeat,
          fromConfirmed,
          toConfirmed,
        ],
      );

      const [created] = await query<{ id: string }>(
        `select id from proposals
         where tournament_id = $1 and player_id = $2 and status = 'pending'`,
        [tournamentId, operation.playerId],
      );
      // Both tables unclaimed and the host proposing means there is nobody left to ask.
      await applyIfBothConfirmed(tournamentId, created.id);
      return;
    }

    case "confirm": {
      const proposal = await loadProposal(tournamentId, operation.id);
      if (proposal.status !== "pending") {
        throw new ActionError("That proposal is already settled", 409);
      }

      const forFrom = await canConfirmFor(tournamentId, actor, proposal.from_table);
      const forTo = await canConfirmFor(tournamentId, actor, proposal.to_table);
      if (!forFrom && !forTo) {
        throw new ActionError("You are not a confirmer for this move", 403);
      }

      await query(
        `update proposals
         set from_confirmed_at = case when $2 then coalesce(from_confirmed_at, now()) else from_confirmed_at end,
             to_confirmed_at   = case when $3 then coalesce(to_confirmed_at, now())   else to_confirmed_at end
         where id = $1`,
        [operation.id, forFrom, forTo],
      );
      await applyIfBothConfirmed(tournamentId, operation.id);
      return;
    }

    case "decline": {
      const proposal = await loadProposal(tournamentId, operation.id);
      const forFrom = await canConfirmFor(tournamentId, actor, proposal.from_table);
      const forTo = await canConfirmFor(tournamentId, actor, proposal.to_table);
      if (!forFrom && !forTo && !actor.isOwner) {
        throw new ActionError("You are not a confirmer for this move", 403);
      }
      if (!operation.reason?.trim()) {
        throw new ActionError("A decline needs a reason", 400);
      }
      await query(
        `update proposals set status = 'declined', decline_reason = $2
         where id = $1 and status = 'pending'`,
        [operation.id, operation.reason.trim()],
      );
      return;
    }

    case "force": {
      if (!actor.isOwner) {
        throw new ActionError("Host only", 403);
      }
      const proposal = await loadProposal(tournamentId, operation.id);
      if (proposal.status !== "pending") {
        throw new ActionError("That proposal is already settled", 409);
      }
      if (Date.now() - proposal.proposed_at.getTime() < FORCE_AFTER_MS) {
        throw new ActionError("Give the captains a minute before forcing", 400);
      }
      await movePlayer(tournamentId, proposal.player_id, proposal.to_table, proposal.to_seat);
      await query(`update proposals set status = 'applied' where id = $1`, [operation.id]);
      return;
    }

    case "cancel": {
      if (!actor.isOwner) {
        throw new ActionError("Host only", 403);
      }
      await query(
        `update proposals set status = 'cancelled' where tournament_id = $1 and id = $2 and status = 'pending'`,
        [tournamentId, operation.id],
      );
      return;
    }
  }
}
