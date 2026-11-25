import { describe, expect, it } from "vitest";
import { eurosToCents, statusLabel } from "./api";
describe("assessment input",()=>{
  it("converts decimal EUR without floating point rounding",()=>{expect(eurosToCents("8420.01")).toBe(842001);expect(eurosToCents("0.01")).toBe(1)});
  it("rejects malformed, zero and oversized amounts",()=>{for(const value of ["0","-1","1.234","1e2","abc","1000000001"])expect(eurosToCents(value)).toBeNull()});
  it("gives each server workflow state a clear label",()=>{for(const state of ["ready","needs_review","blocked","hold","approved","rejected"])expect(statusLabel(state)).not.toBe(state)})
});
