import { FieldValue } from "firebase-admin/firestore";

import { adminDb } from "@/src/lib/firebaseAdmin";

export type ExtensionAuthProfileResult = {
  status: "created" | "updated";
};

export async function initializeExtensionAuthProfile(
  uid: string,
): Promise<ExtensionAuthProfileResult> {
  const profileRef = adminDb.collection("users").doc(uid);
  const profileSnapshot = await profileRef.get();

  if (!profileSnapshot.exists) {
    await profileRef.set(
      {
        createdAt: FieldValue.serverTimestamp(),
        lastLoginAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    return { status: "created" };
  }

  await profileRef.set(
    {
      lastLoginAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return { status: "updated" };
}
