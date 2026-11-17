import { z } from "zod";
import { insertStudentSchema } from "@shared/schema";

export const studentRosterPatchSchema = insertStudentSchema.partial().extend({
  characteristics: z.record(z.union([z.string(), z.array(z.string())])).optional(),
}).strict().superRefine((patch, context) => {
  if (!Object.keys(patch).length) context.addIssue({ code: "custom", message: "No changed learner fields supplied" });
  for (const name of Object.keys(patch.characteristics || {})) {
    if (["__proto__", "constructor", "prototype"].includes(name)) {
      context.addIssue({ code: "custom", path: ["characteristics", name], message: "Invalid characteristic name" });
    }
  }
});
