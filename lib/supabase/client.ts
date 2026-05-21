"use client";

import { createClient as _create } from "@supabase/supabase-js";

let _instance: ReturnType<typeof _create> | undefined;

export function createClient() {
  return (_instance ??= _create(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ));
}
