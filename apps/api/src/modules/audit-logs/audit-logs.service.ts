import { supabase } from "../../shared/supabase.js";

export class AuditLogsService {
  static async log(action: string, description: string, operator: string): Promise<void> {
    try {
      const { error } = await supabase.from("audit_logs").insert({
        action,
        description,
        operator,
        created_at: new Date().toISOString()
      });
      if (error) {
        console.error("[AuditLogs] Error inserting log:", error);
      }
    } catch (err) {
      console.error("[AuditLogs] Exception inserting log:", err);
    }
  }

  static async getLatest(limit = 10): Promise<any[]> {
    try {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit);
      
      if (error) {
        console.error("[AuditLogs] Error fetching latest logs:", error);
        return [];
      }
      
      return data || [];
    } catch (err) {
      console.error("[AuditLogs] Exception fetching latest logs:", err);
      return [];
    }
  }
}
