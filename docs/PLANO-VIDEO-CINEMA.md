# Plano dos clipes de cinema (gerar só com liberação de budget)

Referência estética: óculos de areia dourada com joias magenta no preto puro (foto do Naru).
Um filme só + slides vivos da mesma família. Nada de neon chapado: ouro champanhe, âmbar,
branco quente e joia pontual (magenta/violeta) sobre preto absoluto.

## Clipe 1 — a areia (o filme, 8 s, 16:9, 720p, sem áudio, loop)

Sequência amarrada no conteúdo do hackathon (antes/depois de cada capacidade da Bridge).
Objetos e legendas em letras de partículas brilhantes abaixo de cada forma:

1. documento disperso — legenda `OCR`
2. lupa de busca — legenda `BUSCA`
3. microfone — legenda `SPEECH TO TEXT`
4. balão de conversa — legenda `RESPOSTA COM FONTES`

Prompt (inglês, pronto para Veo via OpenRouter `/videos`):

> Pure black background. Thousands of tiny golden sand grains with a few magenta
> jewel sparks floating in 3D, forming a glowing document icon. The grains slowly
> rotate showing depth, then fly apart and regroup into a magnifying glass, then a
> microphone, then a chat bubble. Below each shape, the same grains spell its service
> name in glowing particle letters: OCR, BUSCA, SPEECH TO TEXT, RESPOSTA COM FONTES
> (one caption at a time). Warm champagne gold with rare magenta jewels, deep black
> void, cinematic macro photography, seamless loop, no audio, no watermark.

Primeiro/último frame (image-to-video): gerar as 4 formas como imagem e interpolar
de 2 em 2 se o texto puro não segurar a forma. Custo estimado: 8 s × ~$0,50 = ~$4
por tentativa em 720p.

## Clipe 2 — capa Stark (8 s, 16:9, 720p, sem áudio, loop)

> Dark warm laboratory at night, holographic golden wireframes (globe, orbit rings)
> rotating slowly, thin code rain rising at the edges, faint amber dust drifting.
> Tony Stark HUD aesthetic, expensive and calm, warm white and champagne gold on
> near-black brown, seamless loop, no audio, no watermark, no people, no text.

## Clipe 3 — detalhe ambiente (4–6 s, 16:9, 720p, sem áudio, loop, reutilizável)

> Absolute black background, slow falling golden dust particles with rare magenta
> sparks, gentle drift, macro bokeh, seamless loop, no audio, no watermark.

## Pipeline pendente (com liberação)

1. `modelrelay`: apelido `video` → `google/veo-3.1-lite` (submit em `/videos`, poll,
   download do MP4 para a pasta do deck).
2. `sagadeck`: campo `video_prompt` (gera o MP4 na primeira compilação e reutiliza;
   `video:` com `loop autoplay muted` embute o arquivo em loop silencioso).
3. Trocar a figura de pontos do slide 4 pelo clipe 1 com poster estático (PPTX usa o poster).
