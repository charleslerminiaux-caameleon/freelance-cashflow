import { beforeEach, expect, it, vi } from "vitest";

import { RepositoryError } from "../repository-error";

const { createClient, deleteCustomer, requireOwner, revalidatePath } = vi.hoisted(() => ({
  createClient: vi.fn(),
  deleteCustomer: vi.fn(),
  requireOwner: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/require-owner", () => ({ requireOwner }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("./repository", () => ({
  createCustomer: vi.fn(),
  deleteCustomer,
  updateCustomer: vi.fn(),
}));

import { deleteCustomerAction } from "./actions";

const initialState = { message: null, success: false };
const customerId = "11111111-1111-4111-8111-111111111111";

function deletionFormData(id = customerId) {
  const formData = new FormData();
  formData.set("customerId", id);
  return formData;
}

beforeEach(() => {
  requireOwner.mockReset();
  createClient.mockReset();
  deleteCustomer.mockReset();
  revalidatePath.mockReset();
  requireOwner.mockResolvedValue({ userId: "owner-1" });
  createClient.mockResolvedValue({});
  deleteCustomer.mockResolvedValue(undefined);
});

it("returns a success state after deleting a customer", async () => {
  const result = await deleteCustomerAction(initialState, deletionFormData());

  expect(result).toEqual({ message: "Client supprimé.", success: true });
  expect(revalidatePath).toHaveBeenCalledWith("/opportunities");
});

it("returns an actionable refusal when a customer is still referenced", async () => {
  deleteCustomer.mockRejectedValue(new RepositoryError("23503"));

  const result = await deleteCustomerAction(initialState, deletionFormData());

  expect(result).toEqual({
    message: "Ce client ne peut pas être supprimé tant qu’il est lié à des données commerciales.",
    success: false,
  });
});

it("returns a safe message for a malformed customer identifier", async () => {
  const malformed = await deleteCustomerAction(initialState, deletionFormData("not-a-uuid"));

  expect(malformed).toEqual({ message: "Impossible de supprimer ce client.", success: false });
});

it("does not expose unexpected database failure details", async () => {
  deleteCustomer.mockRejectedValue(new Error("private postgres connection detail"));
  const outage = await deleteCustomerAction(initialState, deletionFormData());

  expect(outage).toEqual({ message: "Impossible de supprimer ce client.", success: false });
  expect(JSON.stringify(outage)).not.toContain("private postgres connection detail");
});
