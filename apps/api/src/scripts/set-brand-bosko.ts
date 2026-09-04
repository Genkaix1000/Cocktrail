import { env } from "@/config/env";
import { supabase } from "@/shared/supabase";

async function main() {
  console.log(`[set-brand] Actualizando branding a Bosko en: ${env.SUPABASE_URL}`);

  const updateData = {
    brand_name: "Bosko",
    logo_url: "/bosko.webp",
    club_id: "club-1",
    club_name: "Bosko Club",
    text_logo_value: "Bosko",
    theme: "bosko",
    use_logo_url: true,
    logo_size: 56,
    text_logo_size: 26,
  };

  const { data, error } = await supabase
    .from("app_config")
    .upsert({
      id: "default",
      ...updateData,
    })
    .select()
    .single();

  if (error) {
    console.error("[set-brand] ❌ Error actualizando app_config:", error);
    process.exit(1);
  }

  console.log("[set-brand] ✅ Branding actualizado a Bosko con éxito:", data);
}

main().catch((err) => {
  console.error("[set-brand] ❌ Error:", err);
  process.exit(1);
});
