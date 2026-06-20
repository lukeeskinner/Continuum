// Unit tests for OTLP attribute mapping. Run: deno test _shared/trace.test.ts
import { assertEquals } from "jsr:@std/assert@1";
import { toAttrList } from "./trace.ts";

Deno.test("toAttrList: maps each JS type to the right OTLP value type", () => {
  const result = toAttrList({
    count: 5, // integer
    ratio: 0.5, // double
    enabled: true, // bool
    model: "haiku", // string
  });
  assertEquals(result, [
    { key: "count", value: { intValue: 5 } },
    { key: "ratio", value: { doubleValue: 0.5 } },
    { key: "enabled", value: { boolValue: true } },
    { key: "model", value: { stringValue: "haiku" } },
  ]);
});

Deno.test("toAttrList: empty record yields empty list", () => {
  assertEquals(toAttrList({}), []);
});
