// Passo a passo de algoritmos (layout algo): o motor roda o algoritmo de verdade sobre o vetor do slide e grava cada
// passo (comparar, trocar, escrever, pivô, faixa, achou). Quem escreve o slide só diz qual algoritmo e o vetor.
//   algorithm: bubble | insertion | selection | merge | quick | linear | binary     array: [5, 1, 4]   target: 4
// Cada passo: { arr, compare: [i, j], swap: [i, j], write: i, pivot: i, range: [lo, hi], sorted: [índices],
//               found: i, line: n (linha do pseudocódigo), text, comparisons, swaps }

export const ALGO_CODE = {
  bubble: ["para i de 0 até n-2:", "  para j de 0 até n-2-i:", "    se v[j] > v[j+1]:", "      troca v[j] e v[j+1]", "  (o maior chegou ao fim)"],
  insertion: ["para i de 1 até n-1:", "  chave = v[i]; j = i - 1", "  enquanto j >= 0 e v[j] > chave:", "    v[j+1] = v[j]; j = j - 1", "  v[j+1] = chave"],
  selection: ["para i de 0 até n-2:", "  menor = i", "  para j de i+1 até n-1:", "    se v[j] < v[menor]: menor = j", "  troca v[i] e v[menor]"],
  merge: ["ordena(v, ini, fim):", "  se fim - ini < 1: volta", "  meio = (ini + fim) / 2", "  ordena(v, ini, meio); ordena(v, meio+1, fim)", "  intercala as duas metades"],
  quick: ["ordena(v, ini, fim):", "  pivô = v[fim]; i = ini", "  para j de ini até fim-1:", "    se v[j] < pivô: troca v[i] e v[j]; i++", "  troca v[i] e v[fim]  (pivô no lugar)", "  ordena os dois lados"],
  linear: ["para i de 0 até n-1:", "  se v[i] == alvo:", "    achou na posição i", "não achou"],
  binary: ["ini = 0; fim = n-1", "enquanto ini <= fim:", "  meio = (ini + fim) / 2", "  se v[meio] == alvo: achou", "  se v[meio] < alvo: ini = meio + 1", "  senão: fim = meio - 1", "não achou"],
};
export const ALGO_NAMES = { bubble: "Bubble sort", insertion: "Insertion sort", selection: "Selection sort", merge: "Merge sort", quick: "Quicksort", linear: "Busca linear", binary: "Busca binária" };

export function traceAlgorithm(algorithm, input, { target } = {}) {
  const a = [...input].map(Number);
  if (!ALGO_CODE[algorithm]) throw new Error(`algoritmo "${algorithm}" não existe (${Object.keys(ALGO_CODE).join(" | ")})`);
  if (!a.length || a.some((x) => !Number.isFinite(x))) throw new Error("array: uma lista de números, ex.: [5, 1, 4, 2]");
  if (a.length > 16) throw new Error("array: até 16 números (acima disso não dá para ver o passo a passo)");
  const steps = [];
  let comparisons = 0, swaps = 0;
  const sorted = new Set();
  const push = (o) => steps.push({ arr: [...a], sorted: [...sorted], comparisons, swaps, ...o });
  const n = a.length;
  push({ line: 0, text: `Começo: ${n} números fora de ordem.` });
  if (algorithm === "bubble") {
    for (let i = 0; i < n - 1; i++) {
      let trocou = false;
      for (let j = 0; j < n - 1 - i; j++) {
        comparisons++;
        push({ compare: [j, j + 1], line: 2, text: `Compara ${a[j]} com ${a[j + 1]}.` });
        if (a[j] > a[j + 1]) { [a[j], a[j + 1]] = [a[j + 1], a[j]]; swaps++; trocou = true; push({ swap: [j, j + 1], line: 3, text: `${a[j + 1]} > ${a[j]}: troca.` }); }
      }
      sorted.add(n - 1 - i);
      push({ line: 4, text: `${a[n - 1 - i]} chegou ao lugar dele.` });
      if (!trocou) { for (let k = 0; k < n; k++) sorted.add(k); push({ line: 4, text: "Nenhuma troca nesta volta: já está ordenado." }); break; }
    }
    sorted.add(0);
  } else if (algorithm === "insertion") {
    sorted.add(0);
    for (let i = 1; i < n; i++) {
      const key = a[i];
      let j = i - 1;
      push({ pivot: i, line: 1, text: `Pega ${key} e procura o lugar dele à esquerda.` });
      while (j >= 0) {
        comparisons++;
        push({ compare: [j, j + 1], pivot: j + 1, line: 2, text: `${a[j]} > ${key}?` });
        if (a[j] <= key) break;
        a[j + 1] = a[j]; a[j] = key; swaps++;
        push({ swap: [j, j + 1], pivot: j, line: 3, text: `Sim: ${a[j + 1]} anda uma casa para a direita.` });
        j--;
      }
      for (let k = 0; k <= i; k++) sorted.add(k);
      push({ write: j + 1, line: 4, text: `${key} entra na posição ${j + 1}.` });
    }
  } else if (algorithm === "selection") {
    for (let i = 0; i < n - 1; i++) {
      let min = i;
      push({ pivot: min, line: 1, text: `Procura o menor a partir da posição ${i}.` });
      for (let j = i + 1; j < n; j++) {
        comparisons++;
        push({ compare: [j, min], pivot: min, line: 3, text: `${a[j]} < ${a[min]}?` });
        if (a[j] < a[min]) { min = j; push({ pivot: min, line: 3, text: `Novo menor: ${a[min]}.` }); }
      }
      if (min !== i) { [a[i], a[min]] = [a[min], a[i]]; swaps++; push({ swap: [i, min], line: 4, text: `Troca: ${a[i]} vai para a posição ${i}.` }); }
      sorted.add(i);
      push({ line: 4, text: `${a[i]} está no lugar.` });
    }
    sorted.add(n - 1);
  } else if (algorithm === "merge") {
    const sort = (lo, hi) => {
      if (hi - lo < 1) return;
      const mid = Math.floor((lo + hi) / 2);
      push({ range: [lo, hi], line: 2, text: `Divide [${lo}..${hi}] ao meio.` });
      sort(lo, mid); sort(mid + 1, hi);
      const left = a.slice(lo, mid + 1), right = a.slice(mid + 1, hi + 1);
      let i = 0, j = 0, k = lo;
      while (i < left.length && j < right.length) {
        comparisons++;
        push({ range: [lo, hi], compare: [lo + i, mid + 1 + j], line: 4, text: `Intercala: ${left[i]} ou ${right[j]}?` });
        a[k] = left[i] <= right[j] ? left[i++] : right[j++]; swaps++;
        push({ range: [lo, hi], write: k, line: 4, text: `Escreve ${a[k]} na posição ${k}.` }); k++;
      }
      while (i < left.length) { a[k] = left[i++]; swaps++; push({ range: [lo, hi], write: k, line: 4, text: `Sobrou ${a[k]}: vai para a posição ${k}.` }); k++; }
      while (j < right.length) { a[k] = right[j++]; swaps++; push({ range: [lo, hi], write: k, line: 4, text: `Sobrou ${a[k]}: vai para a posição ${k}.` }); k++; }
      if (lo === 0 && hi === n - 1) for (let x = 0; x < n; x++) sorted.add(x);
      push({ range: [lo, hi], line: 4, text: `[${lo}..${hi}] ordenado.` });
    };
    sort(0, n - 1);
  } else if (algorithm === "quick") {
    const sort = (lo, hi) => {
      if (lo > hi) return;
      if (lo === hi) { sorted.add(lo); return; }
      const p = a[hi];
      let i = lo;
      push({ range: [lo, hi], pivot: hi, line: 1, text: `Pivô: ${p}.` });
      for (let j = lo; j < hi; j++) {
        comparisons++;
        push({ range: [lo, hi], pivot: hi, compare: [j, hi], line: 3, text: `${a[j]} < ${p}?` });
        if (a[j] < p) {
          if (i !== j) { [a[i], a[j]] = [a[j], a[i]]; swaps++; push({ range: [lo, hi], pivot: hi, swap: [i, j], line: 3, text: `Sim: ${a[i]} vai para o lado dos menores.` }); }
          i++;
        }
      }
      if (i !== hi) { [a[i], a[hi]] = [a[hi], a[i]]; swaps++; }
      sorted.add(i);
      push({ range: [lo, hi], swap: i !== hi ? [i, hi] : undefined, line: 4, text: `O pivô ${p} vai para a posição ${i}: menores à esquerda, maiores à direita.` });
      sort(lo, i - 1); sort(i + 1, hi);
    };
    sort(0, n - 1);
    for (let x = 0; x < n; x++) sorted.add(x);
  } else if (algorithm === "linear") {
    let found = -1;
    for (let i = 0; i < n; i++) {
      comparisons++;
      push({ compare: [i], line: 1, text: `${a[i]} é ${target}?` });
      if (a[i] === Number(target)) { found = i; push({ found: i, line: 2, text: `Achou ${target} na posição ${i}, depois de ${comparisons} comparações.` }); break; }
    }
    if (found < 0) push({ line: 3, text: `Não achou ${target}: olhou os ${n} números.` });
  } else if (algorithm === "binary") {
    if (a.some((x, i) => i && a[i - 1] > x)) { a.sort((x, y) => x - y); steps[0] = { ...steps[0], arr: [...a], text: "A busca binária precisa do vetor ordenado: ordenei antes." }; }
    let lo = 0, hi = n - 1, found = -1;
    push({ range: [lo, hi], line: 0, text: `Procura ${target} entre as posições ${lo} e ${hi}.` });
    while (lo <= hi) {
      const mid = Math.floor((lo + hi) / 2);
      comparisons++;
      push({ range: [lo, hi], compare: [mid], line: 2, text: `Meio: posição ${mid} (${a[mid]}).` });
      if (a[mid] === Number(target)) { found = mid; push({ range: [lo, hi], found: mid, line: 3, text: `Achou ${target} em ${comparisons} comparações (a busca linear levaria até ${n}).` }); break; }
      if (a[mid] < Number(target)) { lo = mid + 1; push({ range: [lo, hi], line: 4, text: `${a[mid]} < ${target}: descarta a metade da esquerda.` }); }
      else { hi = mid - 1; push({ range: [lo, hi], line: 5, text: `${a[mid]} > ${target}: descarta a metade da direita.` }); }
    }
    if (found < 0) push({ line: 6, text: `Não achou ${target}.` });
  }
  if (["bubble", "insertion", "selection", "merge", "quick"].includes(algorithm)) push({ sorted: a.map((_, i) => i), line: -1, text: `Pronto: ${comparisons} comparações e ${swaps} ${algorithm === "merge" ? "escritas" : "trocas"}.` });
  return steps;
}
