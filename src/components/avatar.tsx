import { cn } from "@/lib/utils";

/**
 * A profile's photo, or their initials when they skipped it. The image comes from its
 * own cached endpoint rather than the polled tournament state.
 */
export function Avatar({
  profileId,
  name,
  className,
}: {
  profileId?: string;
  name: string;
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
      {profileId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/profiles/${profileId}/avatar`}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
          onError={(event) => {
            event.currentTarget.style.display = "none";
          }}
        />
      ) : null}
    </span>
  );
}
