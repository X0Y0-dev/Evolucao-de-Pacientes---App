import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/**
 * Escapa caracteres especiais para prevenir injeção de HTML / XSS.
 */
function escapeHtml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Formata texto preservando quebras de linha com segurança.
 */
function formatText(str: string): string {
  return escapeHtml(str).replace(/\r\n|\n|\r/g, "<br/>");
}

/**
 * Converte Uint8Array para base64 em blocos seguros.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = "";
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(
      null,
      bytes.subarray(i, i + chunkSize) as unknown as number[]
    );
  }
  return btoa(binary);
}

/**
 * Validação de endereço de e-mail (mesma regra do aplicativo).
 */
function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const cleanEmail = email.trim().toLowerCase();
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.(com|[a-z]{2})$/;
  return cleanEmail.includes("@") && emailRegex.test(cleanEmail);
}

Deno.serve(async (req) => {
  // Trata preflight CORS
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Método não permitido. Utilize POST." }),
      { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    // 1. Validar se a secret do Resend está configurada
    const resendKey = Deno.env.get("RESEND_KEY");
    if (!resendKey) {
      console.error("[send-email] Secret RESEND_KEY ausente no ambiente.");
      return new Response(
        JSON.stringify({ error: "Configuração do servidor ausente: RESEND_KEY não configurada." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendFrom = Deno.env.get("RESEND_FROM") || "Evolução de Pacientes <onboarding@resend.dev>";

    // 2. Parse e validação do corpo da requisição
    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Corpo da requisição inválido. Envie um JSON válido." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { relatorioId, destinatario } = body ?? {};

    if (!relatorioId || typeof relatorioId !== "string" || !relatorioId.trim()) {
      return new Response(
        JSON.stringify({ error: "O campo 'relatorioId' é obrigatório." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!destinatario || !isValidEmail(destinatario)) {
      return new Response(
        JSON.stringify({
          error: "Endereço de e-mail do destinatário inválido. Deve conter '@' e terminar em '.com' ou sigla de país.",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Inicializar o cliente Supabase com as credenciais da Edge Function
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || (!supabaseAnonKey && !supabaseServiceKey)) {
      console.error("[send-email] Variáveis do Supabase ausentes no ambiente da Edge Function.");
      return new Response(
        JSON.stringify({ error: "Erro de configuração interna do servidor Supabase." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Usamos o token da requisição se fornecido, com fallback para service_role / anon_key
    const authHeader = req.headers.get("Authorization");
    const clientKey = supabaseServiceKey || supabaseAnonKey || "";

    const supabase = createClient(supabaseUrl, clientKey, {
      global: {
        headers: authHeader ? { Authorization: authHeader } : {},
      },
    });

    // 4. Recuperar relatório do banco
    const { data: relatorio, error: relatorioError } = await supabase
      .from("relatorios")
      .select("*")
      .eq("id", relatorioId.trim())
      .single();

    if (relatorioError || !relatorio) {
      console.error("[send-email] Relatório não encontrado ou erro na busca:", relatorioError?.message);
      return new Response(
        JSON.stringify({ error: "Relatório não encontrado no banco de dados." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Recuperar dados do paciente relacionado
    const { data: paciente, error: pacienteError } = await supabase
      .from("pacientes")
      .select("id, nome_civil, nome_social, prontuario")
      .eq("id", relatorio.paciente_id)
      .single();

    if (pacienteError || !paciente) {
      console.error("[send-email] Paciente vinculado não encontrado:", pacienteError?.message);
      return new Response(
        JSON.stringify({ error: "Paciente vinculado ao relatório não encontrado." }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Determinar o número cronológico persistido do relatório
    const { data: todosRelatorios, error: todosError } = await supabase
      .from("relatorios")
      .select("id, criado_em")
      .eq("paciente_id", relatorio.paciente_id)
      .order("criado_em", { ascending: true });

    let numeroRelatorio = 1;
    if (!todosError && todosRelatorios && todosRelatorios.length > 0) {
      const idx = todosRelatorios.findIndex((r: any) => r.id === relatorio.id);
      numeroRelatorio = idx >= 0 ? idx + 1 : todosRelatorios.length;
    }

    const patientName = paciente.nome_social || paciente.nome_civil || "Paciente";
    const prontuario = paciente.prontuario || "Não informado";
    const transcricao = relatorio.transcricao || "";
    const comentarios = (relatorio.comentario || "").trim();
    const hasComentarios = Boolean(comentarios);

    // 7. Preparar anexos se existirem no Storage
    const attachments: Array<{ filename: string; content: string }> = [];

    if (relatorio.arquivo_path && typeof relatorio.arquivo_path === "string") {
      try {
        const { data: fileBlob, error: downloadError } = await supabase.storage
          .from("relatorios_arquivos")
          .download(relatorio.arquivo_path);

        if (downloadError || !fileBlob) {
          console.error("[send-email] Falha ao recuperar anexo do Storage:", downloadError?.message);
          return new Response(
            JSON.stringify({ error: "Falha ao recuperar o anexo do relatório no armazenamento." }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        // Limite do Resend para anexos: ~25MB seguro
        const MAX_ATTACHMENT_SIZE = 25 * 1024 * 1024;
        if (fileBlob.size > MAX_ATTACHMENT_SIZE) {
          return new Response(
            JSON.stringify({
              error: `O anexo ultrapassa o limite de tamanho permitido (${(MAX_ATTACHMENT_SIZE / (1024 * 1024)).toFixed(0)}MB).`,
            }),
            { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }

        const arrayBuffer = await fileBlob.arrayBuffer();
        const base64Content = uint8ArrayToBase64(new Uint8Array(arrayBuffer));
        const safeFilename =
          relatorio.arquivo_nome?.replace(/[^\w\d_.-]/g, "_") || `anexo-${relatorioId}.pdf`;

        attachments.push({
          filename: safeFilename,
          content: base64Content,
        });
      } catch (storageErr: any) {
        console.error("[send-email] Exceção ao processar anexo:", storageErr?.message);
        return new Response(
          JSON.stringify({ error: "Erro inesperado ao processar o anexo do relatório." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // 8. Montar o template HTML do e-mail respeitando a formatação estrita
    const escapedPatientName = escapeHtml(patientName);
    const escapedProntuario = escapeHtml(prontuario);
    const formattedRelatorio = formatText(transcricao);
    const formattedComentarios = formatText(comentarios);

    const htmlContent = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Relatório ${numeroRelatorio} - ${escapedPatientName}</title>
</head>
<body style="margin: 0; padding: 24px; font-family: Arial, sans-serif; font-size: 12px; color: #000000; line-height: 1.5; background-color: #ffffff;">
  <div style="max-width: 600px; margin: 0 auto; color: #000000; font-family: Arial, sans-serif; font-size: 12px;">

    <!-- Dados cadastrais do paciente -->
    <div style="border-bottom: 1px solid #000000; padding-bottom: 14px; margin-bottom: 22px;">
      <p style="margin: 3px 0; font-size: 12px; color: #000000; font-family: Arial, sans-serif;">
        <strong>Nome:</strong> ${escapedPatientName}
      </p>
      <p style="margin: 3px 0; font-size: 12px; color: #000000; font-family: Arial, sans-serif;">
        <strong>Prontuário:</strong> ${escapedProntuario}
      </p>
      <p style="margin: 3px 0; font-size: 12px; color: #000000; font-family: Arial, sans-serif;">
        <strong>Número do relatório:</strong> ${numeroRelatorio}
      </p>
    </div>

    <!-- Seção RELATÓRIO -->
    <div style="margin-bottom: 24px; ${hasComentarios ? "border-bottom: 1px solid #000000; padding-bottom: 20px;" : ""}">
      <h2 style="font-size: 24px; font-weight: bold; margin: 0 0 12px 0; color: #000000; font-family: Arial, sans-serif;">
        RELATÓRIO:
      </h2>
      <div style="font-size: 12px; color: #000000; font-family: Arial, sans-serif; line-height: 1.6;">
        ${formattedRelatorio}
      </div>
    </div>

    ${
      hasComentarios
        ? `<!-- Seção COMENTÁRIOS -->
    <div style="margin-bottom: 24px;">
      <h2 style="font-size: 24px; font-weight: bold; margin: 0 0 12px 0; color: #000000; font-family: Arial, sans-serif;">
        COMENTÁRIOS:
      </h2>
      <div style="font-size: 12px; color: #000000; font-family: Arial, sans-serif; line-height: 1.6;">
        ${formattedComentarios}
      </div>
    </div>`
        : ""
    }

  </div>
</body>
</html>`;

    // 9. Envio via API oficial do Resend
    const resendPayload: any = {
      from: resendFrom,
      to: [destinatario.trim().toLowerCase()],
      subject: `Relatório ${numeroRelatorio} - ${patientName}`,
      html: htmlContent,
    };

    if (attachments.length > 0) {
      resendPayload.attachments = attachments;
    }

    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(resendPayload),
    });

    const resendResult = await resendResponse.json().catch(() => ({}));

    if (!resendResponse.ok) {
      console.error("[send-email] Falha ao enviar e-mail via Resend API:", resendResponse.status, resendResult?.name);
      const errorMessage =
        resendResult?.message ||
        `Falha ao enviar e-mail pelo Resend (HTTP ${resendResponse.status}). Verifique remetente ou credenciais.`;
      return new Response(
        JSON.stringify({ error: errorMessage }),
        { status: resendResponse.status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "E-mail enviado com sucesso.",
        id: resendResult?.id,
        numeroRelatorio,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("[send-email] Exceção inesperada na Edge Function:", err?.message);
    return new Response(
      JSON.stringify({ error: "Erro interno inesperado no servidor ao processar o envio." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
