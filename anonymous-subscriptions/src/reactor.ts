import { MemoryKeyStorage, RenownCryptoBuilder } from "@renown/sdk";
import { ADMIN_ADDRESS, DOCUMENT_TYPE, DRIVE } from "./config.js";

/** A did:key-signed credential, the shape `verifyBearer` reads. */
export async function mintBearer(address = ADMIN_ADDRESS): Promise<string> {
  const crypto = await new RenownCryptoBuilder()
    .withKeyPairStorage(new MemoryKeyStorage())
    .build();
  return crypto.getBearerToken(address);
}

type GraphqlResult<T> = { data?: T; errors?: Array<{ message: string }> };

export async function graphql<T>(
  url: string,
  query: string,
  token?: string,
): Promise<GraphqlResult<T>> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({ query }),
  });
  if (response.status === 401) {
    return { errors: [{ message: "HTTP 401 (no authenticated caller)" }] };
  }
  return (await response.json()) as GraphqlResult<T>;
}

export type Fixture = { readable: string; withheld: string };

/** One document anyone may read, one only the admin may. */
export async function createFixture(
  url: string,
  token: string,
): Promise<Fixture> {
  const readable = await createDocument(url, token);
  const withheld = await createDocument(url, token);

  const protection = await graphql<{
    setDocumentProtection: { protected: boolean };
  }>(
    url,
    `mutation { setDocumentProtection(documentId: "${withheld}", protected: true) { protected } }`,
    token,
  );
  if (!protection.data?.setDocumentProtection.protected) {
    throw new Error(
      `Could not protect ${withheld}: ${JSON.stringify(protection.errors)}`,
    );
  }

  return { readable, withheld };
}

async function createDocument(url: string, token: string): Promise<string> {
  const created = await graphql<{ createEmptyDocument: { id: string } }>(
    url,
    `mutation { createEmptyDocument(documentType: "${DOCUMENT_TYPE}", parentIdentifier: "${DRIVE}") { id } }`,
    token,
  );
  const id = created.data?.createEmptyDocument.id;
  if (!id) {
    throw new Error(`Could not create a document: ${JSON.stringify(created)}`);
  }
  return id;
}

/** Renaming emits a documentChanges event carrying the renamed document. */
export async function rename(
  url: string,
  token: string,
  documentId: string,
  name: string,
): Promise<void> {
  const renamed = await graphql<{ renameDocument: { name: string } }>(
    url,
    `mutation { renameDocument(documentIdentifier: "${documentId}", name: "${name}") { name } }`,
    token,
  );
  if (!renamed.data?.renameDocument) {
    throw new Error(
      `Could not rename ${documentId}: ${JSON.stringify(renamed)}`,
    );
  }
}

/** Whether a Switchboard answers, so a missing one is reported. */
export async function reachable(url: string): Promise<boolean> {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
    });
    return true;
  } catch {
    return false;
  }
}
