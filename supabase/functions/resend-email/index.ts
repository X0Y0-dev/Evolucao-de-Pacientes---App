import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { withSupabase } from "jsr:@supabase/server@^1";

Deno.serve(
  withSupabase({ auth: "user" }, async (req, ctx) => {
    // 1. Log seguro do método HTTP recebido
    console.log("[resend-email] Método recebido:", req.method);

    if (req.method !== "POST") {
      return Response.json(
        { error: "Método não permitido. Utilize POST." },
        { status: 405 }
      );
    }

    // 2. Log seguro da presença de secrets (SEM imprimir valores sensíveis)
    const resendKey = Deno.env.get("RESEND_KEY");
    const resendFrom = Deno.env.get("RESEND_FROM");

    console.log(
      "[resend-email] Secrets presentes:",
      JSON.stringify({
        has_RESEND_KEY: !!resendKey,
        has_RESEND_FROM: !!resendFrom,
      })
    );

    if (!resendKey) {
      console.error("[resend-email] Secret RESEND_KEY ausente no ambiente.");
      return Response.json(
        { error: "Configuração do servidor ausente: RESEND_KEY não configurada." },
        { status: 500 }
      );
    }

    // 3. Validação segura do corpo da requisição (SEM registrar dados de paciente nem conteúdos)
    let body: any;
    try {
      body = await req.json();
    } catch {
      console.error("[resend-email] Falha ao parsear corpo JSON da requisição.");
      return Response.json(
        { error: "Corpo da requisição inválido. Envie um JSON válido." },
        { status: 400 }
      );
    }

    const { to, subject, html, relatorio_id } = body ?? {};
    const hasTo = !!to && (typeof to === "string" || Array.isArray(to));
    const hasSubject = typeof subject === "string" && subject.trim().length > 0;
    const hasHtml = typeof html === "string" && html.trim().length > 0;

    console.log(
      "[resend-email] Validação do corpo:",
      JSON.stringify({
        has_to: hasTo,
        has_subject: hasSubject,
        has_html: hasHtml,
        has_relatorio_id: !!relatorio_id,
      })
    );

    if (!hasTo || !hasSubject || !hasHtml) {
      return Response.json(
        { error: "Os campos 'to', 'subject' e 'html' são obrigatórios." },
        { status: 400 }
      );
    }

    // 4. Busca segura do anexo com URL assinada temporária (5 min) via RLS autenticado
    let attachments: { filename: string; path: string }[] | undefined;

    if (relatorio_id) {
      const { data: rel, error: relErr } = await ctx.supabase
        .from("relatorios")
        .select("arquivo_path, arquivo_nome")
        .eq("id", relatorio_id)
        .single();

      if (relErr || !rel) {
        return Response.json(
          { error: "Relatório não encontrado." },
          { status: 404 }
        );
      }

      if (rel.arquivo_path) {
        const { data: signed, error: signErr } = await ctx.supabase.storage
          .from("relatorios_arquivos")
          .createSignedUrl(rel.arquivo_path, 300); // expira em 5 min

        if (signErr || !signed) {
          console.error("Falha ao assinar URL do anexo.", signErr?.message);
          return Response.json(
            { error: "Não foi possível acessar o anexo." },
            { status: 500 }
          );
        }

        attachments = [
          {
            filename: rel.arquivo_nome ?? "relatorio",
            path: signed.signedUrl,
          },
        ];
      }
    }

    // 5. Envio pelo provedor Resend com anexo (se existir)
    try {
      const from = resendFrom || "onboarding@resend.dev";
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${resendKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: Array.isArray(to) ? to : [to],
          subject,
          html,
          ...(attachments ? { attachments } : {}),
        }),
      });

      const data = await res.json().catch(() => null);

      if (!res.ok) {
        console.error("Resend recusou o envio.", {
          status: res.status,
          name: data?.name,
          message: data?.message,
        });
        return Response.json(
          {
            error: "Resend recusou o envio.",
            name: data?.name,
            message: data?.message,
          },
          { status: res.status >= 400 && res.status < 500 ? 400 : 502 }
        );
      }

      console.log("[resend-email] E-mail despachado com sucesso pelo provedor.");
      return Response.json({ success: true, id: data?.id });
    } catch (e) {
      console.error(
        "Falha de comunicação com o provedor de e-mail.",
        e instanceof Error ? e.message : String(e),
      );
      return Response.json(
        { error: "Falha de comunicação com o provedor de e-mail." },
        { status: 502 }
      );
    }
  })
);
