// sagadeck · Gerador de Esqueleto Narrativo (Scaffold)
// Economiza até 80% dos tokens de modelos de IA, fornecendo uma estrutura
// pronta e balanceada para preenchimento direto.

export function generateScaffold({
  title = "Minha Apresentação",
  theme = "prata",
  author = "Seu Nome",
  type = "keynote",
} = {}) {
  const normType = String(type).toLowerCase();

  if (normType === "pitch") {
    return {
      title,
      author,
      theme,
      duration: 10,
      slides: [
        {
          layout: "cover",
          kicker: "Apresentação Estratégica",
          title: "Como Criar ==Impacto Real== no Mercado",
          subtitle: "Uma nova abordagem para acelerar resultados",
          author,
          notes: "> Abertura calorosa. Fale sobre o momento atual do mercado antes de entrar nos números.",
        },
        {
          layout: "statement",
          kicker: "O Problema Central",
          text: "Métodos tradicionais gastam muito tempo e entregam ==pouco valor==.",
          by: "Diagnóstico de Mercado",
          center: true,
          notes: "> Enfatize a dor que o cliente ou a empresa enfrenta diariamente.",
        },
        {
          layout: "stats",
          kicker: "Validação & Tração",
          title: "Números que Comprovam a Oportunidade",
          source: "Fonte: Dados de Mercado, 2026",
          stats: [
            {
              value: "4.2x",
              label: "Mais Rápido",
              trend: "recorde",
              trendUp: true,
              icon: "zap",
              text: "Ciclo reduzido drasticamente",
            },
            {
              value: "92%",
              label: "Satisfação dos Clientes",
              trend: "+18%",
              trendUp: true,
              icon: "heart",
              text: "Adesão espontânea",
            },
            {
              value: "68%",
              label: "Redução de Custos",
              trend: "economia",
              trendUp: true,
              icon: "trending-up",
              text: "Eficiência operacional comprovada",
            },
          ],
          notes: "> Apresente cada métrica pausadamente. Elas provam que a dor foi resolvida.",
        },
        {
          layout: "steps",
          kicker: "Como Funciona",
          title: "Jornada em Três Etapas Simples",
          steps: [
            {
              stepNum: 1,
              title: "Diagnóstico",
              text: "Identificação rápida das oportunidades.",
              icon: "search",
              tag: "Dia 1",
            },
            {
              stepNum: 2,
              title: "Implementação",
              text: "Integração fluida sem travar o time.",
              icon: "cpu",
              tag: "Ágil",
            },
            {
              stepNum: 3,
              title: "Escala",
              text: "Geração contínua de resultados concretos.",
              icon: "rocket",
              tag: "Crescimento",
            },
          ],
          notes: "> Mostre que o processo é leve e sem fricção para quem contrata.",
        },
        {
          layout: "cards",
          kicker: "Diferenciais Competitivos",
          title: "Por que Nossa Abordagem é ==Única==",
          cols: 3,
          items: [
            {
              icon: "shield-check",
              badge: "Segurança",
              title: "Confiabilidade",
              text: "Arquitetura blindada e testada em escala.",
              check: true,
              checkText: "Validado",
            },
            {
              icon: "target",
              title: "Acurácia Visual",
              text: "Foco nos objetivos sem ruído desnecessário.",
              progress: 95,
              progressLabel: "Precisão",
            },
            {
              icon: "award",
              title: "Excelência",
              text: "Aprovado pelos principais líderes do setor.",
              rating: 5,
              tags: ["Inovador", "Direto"],
            },
          ],
          notes: "> Destaque o que impede concorrentes de copiarem este modelo.",
        },
        {
          layout: "end",
          title: "Vamos Conversar?",
          subtitle: "Próximos passos e início imediato.",
          contacts: ["contato@empresa.com", "linkedin.com/in/perfil"],
          notes: "> Agradeça, abra para perguntas e direcione para a ação.",
        },
      ],
    };
  }

  if (normType === "palestra" || normType === "aula") {
    return {
      title,
      author,
      theme: theme === "prata" ? "rabisco" : theme,
      duration: 15,
      slides: [
        {
          layout: "cover",
          kicker: "Palestra Interativa",
          title: "Desmistificando o ==Assunto== na Prática",
          subtitle: "Conceitos fundamentais explicados de forma simples",
          author,
          notes: "> Cumprimente a plateia e faça uma introdução descontraída.",
        },
        {
          layout: "question",
          kicker: "Aquecimento",
          question: "Qual o seu maior desafio atual nesta área?",
          options: [
            "Falta de tempo",
            "Complexidade técnica",
            "Engajamento da equipe",
            "Outro motivo",
          ],
          cols: 4,
          timer: 20,
          hint: "Responda rapidamente com a opção mais próxima.",
          notes: "> Dê 20 segundos para a audiência refletir ou responder no chat.",
        },
        {
          layout: "statement",
          kicker: "Quebrando Mitos",
          text: "A complexidade quase sempre é sinal de ==falta de clareza==.",
          center: true,
          notes: "> Conecte com as respostas da pergunta anterior.",
        },
        {
          layout: "stats",
          kicker: "O Cenário Atual",
          title: "O Que a Ciência e os Dados Dizem",
          stats: [
            {
              value: "80%",
              label: "Do Sucesso",
              trend: "foco",
              icon: "zap",
              text: "Vem de fundamentos bem aplicados",
            },
            {
              value: "3x",
              label: "Mais Retenção",
              trend: "comprovado",
              icon: "brain",
              text: "Quando o conteúdo é visual",
            },
            {
              value: "10 min",
              label: "Atenção Máxima",
              trend: "biológico",
              icon: "clock",
              text: "Antes da primeira queda de foco",
            },
          ],
          notes: "> Explique a importância de pausas e variações visuais de ritmo.",
        },
        {
          layout: "steps",
          kicker: "Método Prático",
          title: "Como Aplicar a Partir de Amanhã",
          steps: [
            {
              stepNum: 1,
              title: "Simplificar",
              text: "Remova 50% das palavras dispensáveis.",
              icon: "scissors",
              tag: "Passo 1",
            },
            {
              stepNum: 2,
              title: "Ilustrar",
              text: "Substitua tabelas por ícones e cartões.",
              icon: "palette",
              tag: "Passo 2",
            },
            {
              stepNum: 3,
              title: "Testar",
              text: "Pratique com alguém antes de ir ao palco.",
              icon: "check-circle",
              tag: "Passo 3",
            },
          ],
          notes: "> Detalhe cada passo com um exemplo prático pessoal.",
        },
        {
          layout: "end",
          title: "Obrigado pela Atenção!",
          subtitle: "Perguntas e materiais complementares.",
          contacts: ["seu-email@dominio.com", "sagadeck.org"],
          notes: "> Agradeça e abra para perguntas da plateia.",
        },
      ],
    };
  }

  // Padrão: Keynote Clean / Apple style
  return {
    title,
    author,
    theme: "prata",
    duration: 12,
    slides: [
      {
        layout: "cover",
        kicker: "Keynote de Lançamento",
        title: "Design com ==Propósito==.",
        subtitle: "A harmonia entre simplicidade, respiro e precisão",
        author,
        notes: "> Comece com uma pausa. Deixe o público absorver a frase de abertura.",
      },
      {
        layout: "statement",
        kicker: "Visão Geral",
        text: "Simplicidade é a máxima ==sofisticação==.",
        by: "Filosofia de Design",
        center: true,
        notes: "> Uma frase forte sem distrações na tela.",
      },
      {
        layout: "stats",
        kicker: "Performance Máxima",
        title: "Resultados que Falam por Si",
        stats: [
          {
            value: "3.5x",
            label: "Mais Rápido",
            trend: "nova geração",
            trendUp: true,
            icon: "cpu",
            text: "Arquitetura ultra-eficiente",
          },
          {
            value: "22h",
            label: "Autonomia",
            trend: "+6h a mais",
            trendUp: true,
            icon: "battery-charging",
            text: "Uso contínuo sem tomada",
          },
          {
            value: "99.9%",
            label: "Satisfação",
            trend: "líder global",
            trendUp: true,
            icon: "sparkles",
            text: "Aclamado pela crítica",
          },
        ],
        notes: "> Destaque o ganho de eficiência em relação à versão anterior.",
      },
      {
        layout: "steps",
        kicker: "Engenharia de Ponta",
        title: "Três Fases de Precisão",
        steps: [
          {
            stepNum: 1,
            title: "Foco",
            text: "Eliminar ruídos e elementos supérfluos.",
            icon: "target",
            tag: "Clareza",
          },
          {
            stepNum: 2,
            title: "Acabamento",
            text: "Ajustar proporções e cada detalhe sutil.",
            icon: "layers",
            tag: "Precisão",
          },
          {
            stepNum: 3,
            title: "Entrega",
            text: "Uma experiência respirável e memorável.",
            icon: "award",
            tag: "Excelência",
          },
        ],
        notes: "> Conte a história de como o time chegou a este padrão de qualidade.",
      },
      {
        layout: "cards",
        tone: "dark",
        kicker: "Edição Especial",
        title: "O Poder no Modo Pro",
        cols: 3,
        items: [
          {
            icon: "shield-check",
            badge: "Titânio",
            title: "Resistência",
            text: "Estrutura aeroespacial com zero peso.",
            check: true,
            checkText: "Pro Level",
          },
          {
            icon: "zap",
            title: "Potência",
            text: "Desempenho sustentado sob qualquer carga.",
            progress: 95,
            progressLabel: "Eficiência",
          },
          {
            icon: "star",
            title: "Referência",
            text: "O padrão definitivo para criadores exigentes.",
            rating: 5,
            ratingLabel: "5.0 Pro",
            tags: ["Keynote", "Prata"],
          },
        ],
        notes: "> O tom escuro cria um momento teatral no palco.",
      },
      {
        layout: "end",
        title: "Pense Diferente.",
        subtitle: "Obrigado.",
        contacts: ["apresentacao@empresa.com", "suporte@empresa.com"],
        notes: "> Conclusão elegante e contato.",
      },
    ],
  };
}
