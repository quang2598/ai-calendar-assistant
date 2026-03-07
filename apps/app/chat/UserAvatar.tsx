"use client";

import Image from "next/image";
import { useMemo, useState } from "react";

type UserAvatarProps = {
  photoURL: string | null;
  displayName: string | null;
  email: string | null;
  sizeClassName?: string;
};

function buildInitials(displayName: string | null, email: string | null): string {
  const trimmedName = displayName?.trim() ?? "";
  if (trimmedName) {
    const parts = trimmedName.split(/\s+/).filter(Boolean);
    const first = parts[0]?.[0] ?? "";
    const second = parts.length > 1 ? parts[1]?.[0] ?? "" : "";
    const initials = `${first}${second}`.toUpperCase();
    return initials || "U";
  }

  const firstEmailChar = email?.trim()?.[0];
  return (firstEmailChar ?? "U").toUpperCase();
}

export default function UserAvatar({
  photoURL,
  displayName,
  email,
  sizeClassName = "h-10 w-10",
}: UserAvatarProps) {
  const [imageFailed, setImageFailed] = useState(false);

  const initials = useMemo(() => buildInitials(displayName, email), [displayName, email]);
  const showImage = Boolean(photoURL) && !imageFailed;

  return (
    <div
      className={`${sizeClassName} relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-700 bg-slate-800 text-xs font-semibold uppercase text-slate-200`}
      aria-label="User avatar"
    >
      {showImage ? (
        <Image
          src={photoURL ?? ""}
          alt={displayName ?? email ?? "User"}
          fill
          sizes="40px"
          className="object-cover"
          onError={() => setImageFailed(true)}
          referrerPolicy="no-referrer"
        />
      ) : (
        <span>{initials}</span>
      )}
    </div>
  );
}
