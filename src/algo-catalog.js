// Catálogo de algoritmos prontos para o layout algo, por área (como as toolboxes do MATLAB). Cada um é um programa no
// Python simples de src/pytrace.js; o slide só passa os dados. Algoritmo novo entra aqui como mais um programa:
//   program: o código · call(s): a chamada com os dados do slide · view: o que desenhar e onde ficam os ponteiros
import { pyLiteral } from "./pytrace.js";

const str = (v, d) => pyLiteral(String(v ?? d));
const graphOf = (s, d) => pyLiteral(s.graph && typeof s.graph === "object" ? s.graph : d);
const firstKey = (s, d) => (s.graph && typeof s.graph === "object" ? Object.keys(s.graph)[0] : Object.keys(d)[0]);

const GRAFO = { A: ["B", "C"], B: ["A", "D", "E"], C: ["A", "F"], D: ["B"], E: ["B", "F"], F: ["C", "E"] };
const GRAFO_PESOS = { A: [["B", 4], ["C", 1]], B: [["A", 4], ["C", 2], ["D", 5]], C: [["A", 1], ["B", 2], ["D", 8]], D: [["B", 5], ["C", 8]] };

export const CATALOG = {
  naive: {
    area: "texto", name: "Busca ingênua",
    program: `def busca(texto, padrao):
    n, m = len(texto), len(padrao)
    achados = []
    for i in range(n - m + 1):  # encaixa o padrão na posição {i}
        j = 0
        while j < m and texto[i + j] == padrao[j]:  # texto[{i + j}] com padrao[{j}]: {'igual, avança' if j < m and texto[i + j] == padrao[j] else 'para aqui'}
            j += 1
        if j == m:
            achados.append(i)  # achou na posição {i}
    return achados`,
    call: (s) => `busca(${str(s.text, "abracadabra")}, ${str(s.pattern, "abra")})`,
    view: [{ var: "texto", pointers: ["i + j"] }, { var: "padrao", under: "texto", offset: "i", pointers: ["j"] }, { var: "achados" }],
  },
  kmp: {
    area: "texto", name: "KMP (Knuth-Morris-Pratt)",
    program: `def prefixos(padrao):
    m = len(padrao)
    pi = [0] * m
    k = 0
    for q in range(1, m):
        while k > 0 and padrao[k] != padrao[q]:
            k = pi[k - 1]  # não casou: k volta para {k}
        if padrao[k] == padrao[q]:
            k += 1  # casou: {k} letras de prefixo que também são sufixo
        pi[q] = k  # pi[{q}] = {k}
    return pi

def kmp(texto, padrao):
    n, m = len(texto), len(padrao)
    pi = prefixos(padrao)  # a tabela diz quanto o padrão anda sem voltar no texto
    achados = []
    q = 0
    for i in range(n):
        ini = i - q  # janela começa em {ini}
        while q > 0 and padrao[q] != texto[i]:
            q = pi[q - 1]
            ini = i - q  # não casou: o padrão pula para {ini}, e o texto não volta
        if padrao[q] == texto[i]:
            q += 1  # casou: {q} de {m} letras
        if q == m:
            achados.append(i - m + 1)  # achou na posição {i - m + 1}
            q = pi[q - 1]
    return achados`,
    call: (s) => `kmp(${str(s.text, "abababcabababab")}, ${str(s.pattern, "ababab")})`,
    view: [{ var: "texto", pointers: ["i"] }, { var: "padrao", under: "texto", offset: "ini", pointers: ["q", "k"] }, { var: "pi", as: "cells" }, { var: "achados" }],
  },
  quicksearch: {
    area: "texto", name: "Quick Search (Sunday)",
    program: `def quick_search(texto, padrao):
    n, m = len(texto), len(padrao)
    salto = {}
    for j in range(m):
        salto[padrao[j]] = m - j  # letra '{padrao[j]}': pula {m - j}
    achados = []
    i = 0
    while i <= n - m:  # {'encaixa o padrão na posição ' + str(i) if i <= n - m else 'a janela passou do fim do texto'}
        j = 0
        while j < m and texto[i + j] == padrao[j]:  # texto[{i + j}] com padrao[{j}]: {'igual, avança' if j < m and texto[i + j] == padrao[j] else 'para aqui'}
            j += 1
        if j == m:
            achados.append(i)  # achou na posição {i}
        if i + m >= n:
            break
        c = texto[i + m]  # olha a letra logo depois da janela: '{c}'
        i += salto.get(c, m + 1)  # '{c}' manda a janela para {i}
    return achados`,
    call: (s) => `quick_search(${str(s.text, "gcatcgcagagagtatacagtacg")}, ${str(s.pattern, "gcagagag")})`,
    view: [{ var: "texto", pointers: ["i + j", "i + m"] }, { var: "padrao", under: "texto", offset: "i", pointers: ["j"] }, { var: "salto", as: "table" }, { var: "achados" }],
  },
  bfs: {
    area: "grafos", name: "Busca em largura (BFS)",
    program: `from collections import deque

def bfs(grafo, inicio):
    visitado = {inicio}
    fila = deque([inicio])
    ordem = []
    while fila:
        v = fila.popleft()  # sai da fila: {v}
        ordem.append(v)
        for w in grafo[v]:  # vizinho de {v}: {w}
            if w not in visitado:
                visitado.add(w)
                fila.append(w)  # {w} ainda não foi visto: entra na fila
    return ordem`,
    call: (s) => `bfs(${graphOf(s, GRAFO)}, ${pyLiteral(s.start ?? firstKey(s, GRAFO))})`,
    view: [{ var: "grafo", as: "graph" }, { var: "fila" }, { var: "ordem" }],
  },
  dijkstra: {
    area: "grafos", name: "Dijkstra (menor caminho)",
    program: `import heapq

def dijkstra(grafo, origem):
    dist = {v: float('inf') for v in grafo}
    dist[origem] = 0
    fila = [(0, origem)]
    feito = set()
    while fila:
        d, v = heapq.heappop(fila)  # o mais perto ainda aberto: {v} (distância {d})
        if v in feito:
            continue
        feito.add(v)
        for w, peso in grafo[v]:
            if d + peso < dist[w]:
                dist[w] = d + peso  # caminho melhor até {w}: {dist[w]}
                heapq.heappush(fila, (dist[w], w))
    return dist`,
    call: (s) => `dijkstra(${graphOf(s, GRAFO_PESOS)}, ${pyLiteral(s.start ?? firstKey(s, GRAFO_PESOS))})`,
    view: [{ var: "grafo", as: "graph" }, { var: "dist", as: "table" }, { var: "fila" }],
  },
  bst: {
    area: "árvores", name: "Árvore binária de busca",
    program: `class No:
    def __init__(self, valor):
        self.valor = valor
        self.esq = None
        self.dir = None

def insere(raiz, valor):
    if raiz is None:
        return No(valor)  # lugar vazio: {valor} vira folha
    if valor < raiz.valor:  # {valor} < {raiz.valor}? {'sim: desce à esquerda' if valor < raiz.valor else 'não: desce à direita'}
        raiz.esq = insere(raiz.esq, valor)
    else:
        raiz.dir = insere(raiz.dir, valor)
    return raiz

def monta(valores):
    raiz = None
    for x in valores:  # insere {x}
        raiz = insere(raiz, x)
    return raiz`,
    call: (s) => `monta(${pyLiteral(Array.isArray(s.array) ? s.array : [50, 30, 70, 20, 40, 60, 80])})`,
    view: [{ var: "raiz", from: "monta", as: "tree" }, { var: "valores" }],
  },
};

export const CATALOG_AREAS = [...new Set(Object.values(CATALOG).map((c) => c.area))];
