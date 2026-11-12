import { describe, expect, test } from 'vitest';
import { formatarVariacao, intervaloAnterior, mediana, projecaoFechamento, variacaoPct } from '../src/calculo.js';

describe('mediana (regra 3: todo tempo é medido pela mediana)', () => {
  test('lista vazia não tem mediana', () => {
    expect(mediana([])).toBeNull();
  });
  test('quantidade ímpar devolve o valor do meio', () => {
    expect(mediana([9, 1, 5])).toBe(5);
  });
  test('quantidade par devolve a média dos dois do meio', () => {
    expect(mediana([1, 2, 3, 10])).toBe(2.5);
  });
});

describe('comparação padrão (regra 2)', () => {
  test('1 a 10 de novembro compara com 1 a 10 de outubro', () => {
    expect(intervaloAnterior('2026-11-01', '2026-11-10')).toEqual({ inicio: '2026-10-01', fim: '2026-10-10' });
  });
  test('janeiro compara com dezembro do ano anterior', () => {
    expect(intervaloAnterior('2027-01-01', '2027-01-15')).toEqual({ inicio: '2026-12-01', fim: '2026-12-15' });
  });
  test('dia 31 cai no último dia do mês anterior quando ele é mais curto', () => {
    expect(intervaloAnterior('2026-03-01', '2026-03-31')).toEqual({ inicio: '2026-02-01', fim: '2026-02-28' });
  });
  test('variação é a diferença em % sobre o período anterior', () => {
    expect(variacaoPct(150, 100)).toBe(50);
    expect(variacaoPct(80, 100)).toBe(-20);
  });
  test('sem dado no período atual não há variação', () => {
    expect(variacaoPct(null, 100)).toBeNull();
  });
  test('sem dado ou zero no período anterior não há variação', () => {
    expect(variacaoPct(100, null)).toBeNull();
    expect(variacaoPct(100, 0)).toBeNull();
  });
  test('sem variação mostra "—", nunca "−100%"', () => {
    expect(formatarVariacao(variacaoPct(null, 100))).toBe('—');
  });
  test('variação mostra sinal e uma casa decimal', () => {
    expect(formatarVariacao(12.345)).toBe('+12,3%');
    expect(formatarVariacao(-20)).toBe('−20,0%');
  });
});

describe('projeção de fechamento', () => {
  test('projeta o ritmo do período para o mês inteiro', () => {
    expect(projecaoFechamento(1000, 10, 30)).toBe(3000);
  });
  test('sem dias corridos não há projeção', () => {
    expect(projecaoFechamento(0, 0, 30)).toBeNull();
  });
});
