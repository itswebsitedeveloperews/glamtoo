import { File } from "@google-cloud/storage";

const ACL_POLICY_METADATA_KEY = "custom:aclPolicy";

export enum ObjectPermission {
  READ = "read",
  WRITE = "write",
}

export interface ObjectAclPolicy {
  owner: string;
  visibility: "public" | "private";
}

export async function setObjectAclPolicy(objectFile: File, aclPolicy: ObjectAclPolicy): Promise<void> {
  const [exists] = await objectFile.exists();
  if (!exists) throw new Error(`Object not found: ${objectFile.name}`);
  await objectFile.setMetadata({ metadata: { [ACL_POLICY_METADATA_KEY]: JSON.stringify(aclPolicy) } });
}

export async function getObjectAclPolicy(objectFile: File): Promise<ObjectAclPolicy | null> {
  const [metadata] = await objectFile.getMetadata();
  const aclPolicy = metadata?.metadata?.[ACL_POLICY_METADATA_KEY];
  return aclPolicy ? JSON.parse(aclPolicy as string) as ObjectAclPolicy : null;
}

export async function canAccessObject({
  userId,
  objectFile,
  requestedPermission,
}: {
  userId?: string;
  objectFile: File;
  requestedPermission: ObjectPermission;
}) {
  const aclPolicy = await getObjectAclPolicy(objectFile);
  if (!aclPolicy) return false;
  if (aclPolicy.visibility === "public" && requestedPermission === ObjectPermission.READ) return true;
  return Boolean(userId && aclPolicy.owner === userId);
}