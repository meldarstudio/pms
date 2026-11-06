import { saveAccount } from "./account.mjs";
import { localDatabase } from "./d1.mjs";

export const localOwner = {
  username: "kevin",
  password: "owner horse battery staple",
  role: "owner",
};

export function seedLocalOwner(persistTo) {
  return saveAccount({
    username: localOwner.username,
    role: localOwner.role,
    password: localOwner.password,
    target: localDatabase(persistTo),
  });
}
