import { cn } from "@/lib/utils";

/**
 * A profile's photo, or their initials when they skipped it. The image comes from its
 * own cached endpoint rather than the polled tournament state.
 */
export function Avatar({
  profileId,
  name,
  hasAvatar = true,
  className,
}: {
  profileId?: string;
  name: string;
  /**
   * Whether a photo exists yet. Passing it means the element is created the poll after
   * one appears; without it a card drawn before the photo existed would 404 once, hide
   * itself and never look again.
   */
  hasAvatar?: boolean;
  className?: string;
}) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-muted text-xs font-semibold text-muted-foreground",
        className ?? "h-8 w-8",
      )}
    >
      {/* Initials sit underneath; the photo covers them once it loads, and uncovers
          them again if there is none. */}
      <span>{initials}</span>
      {profileId && hasAvatar ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/profiles/${profileId}/avatar`}
          alt=""
          draggable={false}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </span>
  );
}
