/**
 * Um Supabase em memória, só com o que o sync usa.
 *
 * Não é um mock que devolve o que o teste quer ouvir: ele imita as duas
 * propriedades do servidor real que importam para a sincronização —
 *
 *   1. todas as linhas de um mesmo upsert ganham o MESMO `updated_at`, porque
 *      no Postgres `now()` é a hora da transação, não da linha;
 *   2. com `lww` ligado, uma versão mais velha do registro não sobrescreve a
 *      mais nova (é o gatilho da migração 0005).
 */

export interface ServerRow {
  space_id: string;
  collection: string;
  id: string;
  data: Record<string, unknown>;
  updated_at: string;
  deleted_at: string | null;
}

export class FakeServer {
  rows = new Map<string, ServerRow>();
  lww = true;
  /** o espaço que a conta já tem; o create_space devolve ele em vez de criar outro (migração 0003) */
  existingSpace: { id: string; name: string } | null = null;
  private tick = 0;

  /** carimbo do servidor: sempre crescente, com microssegundos como o Postgres */
  private stamp(): string {
    this.tick += 1;
    const base = Date.UTC(2026, 8, 24, 12, 0, 0);
    const ms = base + Math.floor(this.tick / 1000);
    const micro = String(this.tick % 1000).padStart(3, '0');
    return new Date(ms).toISOString().replace('Z', `${micro}+00:00`);
  }

  upsert(rows: Omit<ServerRow, 'updated_at'>[]): void {
    const at = this.stamp(); // uma transação, um carimbo
    for (const row of rows) {
      const key = `${row.space_id}|${row.collection}|${row.id}`;
      const old = this.rows.get(key);
      if (old && this.lww) {
        const oldAt = String(old.data.updatedAt ?? '');
        const newAt = String(row.data.updatedAt ?? '');
        if (oldAt > newAt) continue; // o gatilho devolve NULL: a linha fica como estava
      }
      this.rows.set(key, { ...row, updated_at: at });
    }
  }

  client() {
    return {
      from: (table: string) => new Table(this, table),
      storage: { from: () => ({}) },
      rpc: (name: string, args: { space_id: string; space_name: string }) => ({
        single: async () =>
          name === 'create_space'
            ? { data: this.existingSpace ?? { id: args.space_id, name: args.space_name }, error: null }
            : { data: null, error: { message: `rpc ${name}` } },
      }),
    };
  }
}

type Filter = (r: ServerRow) => boolean;

class Table {
  constructor(private server: FakeServer, private table: string) {}

  async upsert(rows: Omit<ServerRow, 'updated_at'>[]) {
    if (this.table !== 'records') return { error: { message: `tabela ${this.table}` } };
    this.server.upsert(rows);
    return { error: null };
  }

  select() {
    return new Query(this.server);
  }
}

class Query {
  private filters: Filter[] = [];
  private orders: { col: keyof ServerRow; asc: boolean }[] = [];
  private max = Infinity;

  constructor(private server: FakeServer) {}

  eq(col: keyof ServerRow, value: string) {
    this.filters.push((r) => r[col] === value);
    return this;
  }
  gt(col: keyof ServerRow, value: string) {
    this.filters.push((r) => String(r[col]) > value);
    return this;
  }
  gte(col: keyof ServerRow, value: string) {
    this.filters.push((r) => String(r[col]) >= value);
    return this;
  }
  /** só a forma que o sync usa: `a.gt."x",and(a.eq."x",b.gt."y")` */
  or(expr: string) {
    const m = /^(\w+)\.gt\."([^"]*)",and\((\w+)\.eq\."([^"]*)",(\w+)\.gt\."([^"]*)"\)$/.exec(expr);
    if (!m) throw new Error(`or() que o fake não entende: ${expr}`);
    const [, c1, v1, c2, v2, c3, v3] = m as unknown as [string, keyof ServerRow, string, keyof ServerRow, string, keyof ServerRow, string];
    this.filters.push((r) => String(r[c1]) > v1 || (String(r[c2]) === v2 && String(r[c3]) > v3));
    return this;
  }
  order(col: keyof ServerRow, opts: { ascending: boolean }) {
    this.orders.push({ col, asc: opts.ascending });
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }

  then(ok?: (v: { data: ServerRow[]; error: null }) => unknown, fail?: (e: unknown) => unknown) {
    let out = [...this.server.rows.values()].filter((r) => this.filters.every((f) => f(r)));
    out.sort((a, b) => {
      for (const o of this.orders) {
        const x = String(a[o.col]);
        const y = String(b[o.col]);
        if (x !== y) return (x < y ? -1 : 1) * (o.asc ? 1 : -1);
      }
      return 0;
    });
    out = out.slice(0, this.max).map((r) => structuredClone(r));
    return Promise.resolve({ data: out, error: null as null }).then(ok, fail);
  }
}
