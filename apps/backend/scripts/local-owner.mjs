import { saveAccount } from "./account.mjs";

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
    target: ["--local", ...(persistTo ? ["--persist-to", persistTo] : [])],
  });
}
