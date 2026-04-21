import type { DocumentModelModule } from "document-model";
import { RoleBasedAuth as RoleBasedAuthV1 } from "./role-based-auth/v1/module.js";

export const documentModels: DocumentModelModule<any>[] = [
  RoleBasedAuthV1,
];
