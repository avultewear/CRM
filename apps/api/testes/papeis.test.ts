import { describe, expect, test } from 'vitest';
import { METRICAS, metricasPara } from '../src/metricas.js';
import { CATALOGO_PARAMETROS, validarParametro } from '../src/parametros.js';
import { PAPEIS, permissoesDe, pode } from '../src/papeis.js';

describe('papéis: cada um vê só o que deve', () => {
  test('Sócio tem todas as permissões da equipe interna, inclusive as cifras', () => {
    for (const p of ['painel.ver', 'cifras.ver', 'metas.editar', 'financeiro.ver', 'auditoria.ver', 'equipe.editar']) {
      expect(pode('SOCIO', p), p).toBe(true);
    }
  });
  test('Gerente vê a equipe inteira, sem cifras, Metas, Financeiro nem Auditoria', () => {
    expect(permissoesDe('GERENTE')).toEqual(
      expect.arrayContaining(['painel.ver', 'atendimento.ver', 'pedidos.ver', 'clientes.ver', 'estoque.ver', 'estoque.editar', 'equipe.ver', 'equipe.editar', 'reunioes.ver', 'social.aprovar', 'influenciadores.gestao']),
    );
    for (const p of ['cifras.ver', 'metas.editar', 'metas.ver', 'financeiro.ver', 'auditoria.ver']) {
      expect(pode('GERENTE', p), p).toBe(false);
    }
  });
  test('Vendedor vê atendimento, pedidos, clientes, estoque e a própria comissão, e nada de gestão', () => {
    expect(permissoesDe('VENDEDOR').sort()).toEqual(
      ['atendimento.ver', 'clientes.ver', 'estoque.ver', 'ganhos.meus', 'metricas.ver', 'pedidos.ver'].sort(),
    );
  });
  test('Gestor de tráfego vê só a aba Tráfego', () => {
    expect(permissoesDe('GESTOR_TRAFEGO').sort()).toEqual(['metricas.ver', 'trafego.ver'].sort());
  });
  test('Social media vê o próprio espaço e o estoque em leitura', () => {
    expect(permissoesDe('SOCIAL_MEDIA').sort()).toEqual(['estoque.ver', 'metricas.ver', 'social.espaco'].sort());
    expect(pode('SOCIAL_MEDIA', 'estoque.editar')).toBe(false);
  });
  test('Influenciador vê só o próprio espaço', () => {
    expect(permissoesDe('INFLUENCIADOR')).toEqual(['influenciador.espaco']);
  });
  test('permissão desconhecida é negada para todos', () => {
    for (const papel of PAPEIS) expect(pode(papel, 'nao.existe')).toBe(false);
  });
});

describe('dicionário de métricas (regra 1)', () => {
  test('toda ficha tem os campos obrigatórios preenchidos', () => {
    expect(METRICAS.length).toBeGreaterThan(10);
    for (const m of METRICAS) {
      for (const campo of ['id', 'nome', 'definicao', 'formula', 'fonte', 'janela', 'comparacao', 'faixas', 'versao'] as const) {
        expect(m[campo], `${m.id}.${campo}`).toBeTruthy();
      }
      expect(m.quemVe.length, `${m.id}.quemVe`).toBeGreaterThan(0);
    }
  });
  test('não há duas fichas com o mesmo id', () => {
    const ids = METRICAS.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  test('as cifras dos Sócios só aparecem para o Sócio', () => {
    for (const id of ['pro_labore', 'lucro', 'comissoes_pagas', 'gasto_anuncios']) {
      expect(metricasPara('SOCIO').some((m) => m.id === id), `sócio vê ${id}`).toBe(true);
      expect(metricasPara('GERENTE').some((m) => m.id === id), `gerente não vê ${id}`).toBe(false);
      expect(metricasPara('VENDEDOR').some((m) => m.id === id), `vendedor não vê ${id}`).toBe(false);
    }
  });
  test('o gestor de tráfego vê gasto e ROAS do tráfego, sem pró-labore nem lucro', () => {
    const ids = metricasPara('GESTOR_TRAFEGO').map((m) => m.id);
    expect(ids).toEqual(expect.arrayContaining(['investimento_trafego', 'roas', 'custo_por_lead']));
    expect(ids).not.toContain('pro_labore');
    expect(ids).not.toContain('lucro');
  });
  test('influenciador não recebe nenhuma ficha', () => {
    expect(metricasPara('INFLUENCIADOR')).toEqual([]);
  });
});

describe('catálogo de parâmetros (Metas)', () => {
  test('tem os parâmetros que o prompt entrega aos Sócios', () => {
    const chaves = CATALOGO_PARAMETROS.map((p) => p.chave);
    expect(chaves).toEqual(
      expect.arrayContaining([
        'meta_faturamento_mensal', 'meta_faturamento_anual', 'orcamento_anuncios_mensal', 'prolabore_pct',
        'prolabore_divisao_fundador_pct', 'limite_desconto_pct', 'piso_margem_pct', 'prazo_troca_dias',
        'segmento_em_risco_dias', 'segmento_inativo_dias', 'recuperacao_tentativas', 'carrinho_abandono_minutos',
        'cobertura_minima_dias', 'frase_motivacional',
      ]),
    );
  });
  test('percentual só aceita de 0 a 100', () => {
    expect(validarParametro('prolabore_pct', 10).ok).toBe(true);
    expect(validarParametro('prolabore_pct', 101).ok).toBe(false);
    expect(validarParametro('prolabore_pct', -1).ok).toBe(false);
    expect(validarParametro('prolabore_pct', 'dez').ok).toBe(false);
  });
  test('dias e tentativas só aceitam número inteiro não negativo', () => {
    expect(validarParametro('prazo_troca_dias', 7).ok).toBe(true);
    expect(validarParametro('prazo_troca_dias', 7.5).ok).toBe(false);
    expect(validarParametro('prazo_troca_dias', -1).ok).toBe(false);
  });
  test('valor em R$ não aceita negativo', () => {
    expect(validarParametro('meta_faturamento_mensal', 50000).ok).toBe(true);
    expect(validarParametro('meta_faturamento_mensal', -5).ok).toBe(false);
  });
  test('chave fora do catálogo é recusada', () => {
    expect(validarParametro('inventado', 1).ok).toBe(false);
  });
});
