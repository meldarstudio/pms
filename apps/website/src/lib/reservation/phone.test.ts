import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { contactKey, storedContact, storeContact } from "./draft";
import { reviewProblems, trimmedContact } from "./checkout-form";
import { editPhone, phoneClipboardText } from "./phone-mask";
import { emptyPhone, phoneInputText, phoneResult, storedPhone, typePhone } from "./phone";

afterEach(() => vi.unstubAllGlobals());

describe("phone editing", () => {
  it("formats a pasted international number and selects its country", () => {
    const edited = editPhone(emptyPhone, { text: "+44 20 7946 0018", caret: 16 });
    expect(edited.value).toEqual({ country: "GB", text: "02079460018" });
    expect(edited.text).toBe("020 7946 0018");
    expect(phoneResult(edited.value)).toEqual({ phone: "+442079460018" });
  });

  it("keeps typing and separator deletion predictable", () => {
    const value = typePhone(emptyPhone, "987654321");
    expect(phoneInputText(value)).toBe("987 654 321");
    expect(editPhone(value, { text: "987654 321", caret: 3, deletion: "backward" })).toMatchObject({
      value: { country: "PE", text: "98654321" },
      caret: 2,
    });
    expect(phoneClipboardText("987 654 321", 0, 7)).toBe("987654");
  });
});

describe("contact validation and restoration", () => {
  const contact = {
    fullName: " Ana Torres ",
    email: " ana@example.com ",
    phone: emptyPhone,
    notes: "",
  };

  it.each([
    ["", "required"],
    ["123", "tooShort"],
    ["987654321123456789", "tooLong"],
    ["987654321 ext 12", "extension"],
    ["not a number", "invalid"],
  ])("rejects %s as %s before acceptance", (text, problem) => {
    const phone = { country: "PE" as const, text };
    expect(phoneResult(phone)).toEqual({ problem });
    expect(reviewProblems({ ...contact, phone }, true).firstInvalid).toBe("phone");
  });

  it("normalizes a valid number without including notes in the contact body", () => {
    expect(
      trimmedContact({ ...contact, phone: storedPhone("+51 987 654 321"), notes: "Late arrival" }),
    ).toEqual({
      fullName: "Ana Torres",
      email: "ana@example.com",
      phone: "+51987654321",
    });
  });

  it("restores old string drafts and preserves incomplete country drafts and notes", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    });
    values.set("hm.reservation.contact", JSON.stringify({ ...contact, phone: "+44 20 7946 0018" }));
    expect(storedContact().phone).toEqual({ country: "GB", text: "02079460018" });
    values.set("hm.reservation.contact", JSON.stringify({ ...contact, phone: "98765" }));
    expect(storedContact().phone).toEqual({ country: "PE", text: "98765" });
    const draft = {
      ...contact,
      phone: { country: "FR" as const, text: "06" },
      notes: "  Late arrival  ",
    };
    storeContact(draft);
    expect(storedContact()).toEqual(draft);
    expect(contactKey(storedContact())).toBe(contactKey(draft));
  });
});
