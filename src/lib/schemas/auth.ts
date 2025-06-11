import { z } from "zod";

export const loginFormSchema = z.object({
  serverUrl: z.string().url("Please enter a valid URL"),
  username: z.string().min(1, "Username is required"),
  password: z.string().min(1, "Password is required"),
});
