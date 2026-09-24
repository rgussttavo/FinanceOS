'use client';

import * as React from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import {
  Button,
  Chip,
  EmptyState,
  Field,
  Input,
  Meter,
  Money,
  Panel,
  SectionTitle,
  Segmented,
  Select,
  Sheet,
  Skeleton,
  confirmAction,
  toast,
} from '@/components/ui';
import { cn } from '@/lib/cn';
import { formatMonthLabel, nowInstant, todayIso } from '@/lib/dates';
import { formatMoney, formatPercent, parseMoney } from '@/lib/money';
import type { Route } from '@/lib/nav';
import type { FinanceBase } from '@/lib/picture';
import { createAsset, removeAsset, updateAsset } from '@/lib/store';
import type { Asset, Cents, FipeRef } from '@/lib/types';
import { wealthHistory, wealthNow } from '@/lib/wealth';

const ASSET_ICONS: Record<Asset['kind'], string[]> = {
  property: ['🏠', '🏢', '🏘️', '🏬', '🌳'],
  vehicle: ['🚗', '🏍️', '🚚', '🚙', '🛻'],
  other: ['💻', '📱', '💍', '⌚', '🎸', '📷', '🛋️', '🖥️', '💎', '📦'],
};

const KIND_LABEL: Record<Asset['kind'], string> = {
  property: 'Imóvel',
  vehicle: 'Veículo',
  other: 'Outro bem',
};

/* ------------------------------------------------------------------- tela */

const PERIODS: { months: number; label: string; long: string }[] = [
  { months: 2, label: '1 mês', long: 'no último mês' },
  { months: 4, label: '3 meses', long: 'nos últimos 3 meses' },
  { months: 7, label: '6 meses', long: 'nos últimos 6 meses' },
  { months: 13, label: '1 ano', long: 'no último ano' },
  { months: 37, label: '3 anos', long: 'nos últimos 3 anos' },
];

/**
 * Seu patrimônio: o que você tem menos o que você deve.
 *
 * A resposta vem primeiro, em um número, e logo abaixo o que a compõe dos dois
 * lados. A evolução responde "estou crescendo?" com uma linha só e a diferença
 * no período — sem gráfico que precise de legenda para ser entendido.
 */
export function PatrimonioView({
  spaceId,
  base,
  cashNow,
  hidden,
  cardsEnabled,
  onGo,
}: {
  spaceId: string;
  base: FinanceBase;
  cashNow: Cents;
  hidden: boolean;
  cardsEnabled: boolean;
  onGo: (route: Route) => void;
}) {
  const [sheet, setSheet] = React.useState<{ open: boolean; editing: Asset | null }>({ open: false, editing: null });
  const [period, setPeriod] = React.useState(2);
  const today = todayIso();

  const w = React.useMemo(
    () =>
      wealthNow({
        assets: base.assets,
        entries: base.entries,
        debts: base.debts,
        cards: base.cards,
        subscriptions: base.subscriptions,
        cashNow,
        today,
        cardsEnabled,
      }),
    [base, cashNow, today, cardsEnabled],
  );
  const history = React.useMemo(
    () => wealthHistory({ assets: base.assets, entries: base.entries, debts: base.debts, today }, PERIODS[period].months),
    [base, today, period],
  );

  if (!base.ready) {
    return (
      <div className="grid gap-4 pt-2 lg:grid-cols-2">
        <Skeleton className="h-[220px] rounded-panel" />
        <Skeleton className="h-[220px] rounded-panel" />
      </div>
    );
  }

  const first = history[0]?.net ?? 0;
  const last = history[history.length - 1]?.net ?? 0;
  const delta = last - first;
  const money = (v: Cents) => formatMoney(v, { hidden });

  const assetGroups: { label: string; value: Cents; icon: string; detail?: string; action?: () => void }[] = [
    { label: 'Dinheiro em conta', value: w.cash, icon: '💵', detail: 'saldo de hoje, calculado', action: () => onGo({ view: 'inicio' }) },
    { label: 'Investimentos', value: w.investments, icon: '📈', detail: 'soma dos aportes', action: () => onGo({ view: 'movimentos', param: 'investimentos' }) },
    { label: 'Imóveis', value: w.property, icon: '🏠' },
    { label: 'Veículos', value: w.vehicles, icon: '🚗' },
    { label: 'Outros bens', value: w.otherAssets, icon: '📦' },
  ];
  const debtGroups: { label: string; value: Cents; icon: string; action?: () => void }[] = [
    { label: 'Financiamentos', value: w.financing, icon: '🏦', action: () => onGo({ view: 'dividas' }) },
    { label: 'Empréstimos', value: w.loans, icon: '💸', action: () => onGo({ view: 'dividas' }) },
    { label: 'Cartões', value: w.cards, icon: '💳', action: () => onGo({ view: 'cartoes' }) },
    { label: 'Outras dívidas', value: w.otherDebts, icon: '🧾', action: () => onGo({ view: 'dividas' }) },
  ];

  return (
    <div className="grid gap-4 pt-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start lg:gap-6">
      <div className="grid gap-4">
        <Panel className="p-5">
          <p className="text-[13px] text-ink-3">Patrimônio líquido</p>
          <p className={cn('amount mt-1.5 text-[44px]', w.net < 0 ? 'text-out' : 'text-ink')}>
            <Money value={w.net} hidden={hidden} animate />
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-field bg-surface-2 px-3 py-2.5">
              <p className="text-[12px] text-ink-3">Você tem</p>
              <p className="tnum text-[16px] font-semibold text-in">{money(w.assetsTotal)}</p>
            </div>
            <div className="rounded-field bg-surface-2 px-3 py-2.5">
              <p className="text-[12px] text-ink-3">Você deve</p>
              <p className="tnum text-[16px] font-semibold text-out">{money(w.liabilitiesTotal)}</p>
            </div>
          </div>
          {w.assetsTotal > 0 ? (
            <Meter
              value={w.liabilitiesTotal / Math.max(1, w.assetsTotal)}
              tone={w.liabilitiesTotal > w.assetsTotal * 0.5 ? 'warn' : 'accent'}
              label="Quanto do que você tem está comprometido com dívidas"
              valueText={`${formatPercent(w.liabilitiesTotal / Math.max(1, w.assetsTotal))} comprometido`}
              className="mt-4"
              height={6}
            />
          ) : null}
          {w.assetsTotal > 0 ? (
            <p className="mt-1.5 text-[12px] text-ink-3">
              {formatPercent(Math.min(1, w.liabilitiesTotal / Math.max(1, w.assetsTotal)))} do que você tem está comprometido com dívidas.
            </p>
          ) : null}
        </Panel>

        <Panel className="p-5">
          <SectionTitle>Estou evoluindo?</SectionTitle>
          <div className="-mx-1 mb-3 flex gap-1.5 overflow-x-auto px-1">
            {PERIODS.map((p, i) => (
              <Chip key={p.label} active={period === i} onClick={() => setPeriod(i)} className="h-8 px-3 text-[12px]">
                {p.label}
              </Chip>
            ))}
          </div>
          <p className="text-[15px] text-ink">
            {delta === 0 ? (
              'Sem mudança no período.'
            ) : (
              <>
                {delta > 0 ? 'Cresceu' : 'Diminuiu'}{' '}
                <strong className={cn('font-semibold', delta > 0 ? 'text-in' : 'text-out')}>{money(Math.abs(delta))}</strong>{' '}
                {PERIODS[period].long}
                {first > 0 ? <span className="text-ink-3"> ({delta > 0 ? '+' : '−'}{formatPercent(Math.abs(delta) / first, 1)})</span> : null}.
              </>
            )}
          </p>
          <NetLine points={history.map((h) => h.net)} labels={history.map((h) => h.month)} hidden={hidden} />
          <p className="mt-2 text-[12px] leading-snug text-ink-3">
            Investimentos, bens e dívidas mês a mês. Saldo em conta e cartões ficam de fora do histórico, porque o app só os
            conhece do mês atual; bens entram a partir da compra, pelo valor de hoje.
          </p>
        </Panel>
      </div>

      <div className="grid gap-4">
        <Panel className="p-5">
          <SectionTitle>Ativos</SectionTitle>
          <GroupList groups={assetGroups} hidden={hidden} tone="text-ink" />
        </Panel>
        <Panel className="p-5">
          <SectionTitle>Passivos</SectionTitle>
          <GroupList groups={debtGroups} hidden={hidden} tone="text-out" />
        </Panel>

        <Panel className="px-5 py-4">
          <SectionTitle
            action={
              <Button size="sm" variant="soft" onClick={() => setSheet({ open: true, editing: null })}>
                <Plus size={15} /> Cadastrar bem
              </Button>
            }
          >
            Seus bens
          </SectionTitle>

          {base.assets.length ? (
            <ul className="divide-y divide-line">
              {base.assets.map((asset) => (
                <li key={asset.id}>
                  <button type="button" onClick={() => setSheet({ open: true, editing: asset })} className="flex min-h-14 w-full items-center gap-3 py-2.5 text-left">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-[18px]" aria-hidden>
                      {asset.icon}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] text-ink">{asset.name}</span>
                      <span className="block truncate text-[12px] text-ink-3">
                        {KIND_LABEL[asset.kind]}
                        {asset.fipe ? ' · valor da tabela FIPE' : ''}
                        {asset.indexedByIpca ? ' · corrigido pelo IPCA' : ''}
                        {asset.purchaseValue && asset.purchaseValue !== asset.value
                          ? ` · ${asset.value > asset.purchaseValue ? 'valorizou' : 'desvalorizou'} ${formatPercent(Math.abs(asset.value - asset.purchaseValue) / asset.purchaseValue)}`
                          : ''}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-[15px] font-semibold text-ink">{money(asset.value)}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              compact
              title="Nenhum bem cadastrado"
              description="Cadastre carro, moto, imóvel e outros bens. Para veículos, o app busca o valor na tabela FIPE sozinho."
              action={
                <Button variant="primary" onClick={() => setSheet({ open: true, editing: null })}>
                  <Plus size={16} />
                  Cadastrar bem
                </Button>
              }
            />
          )}
        </Panel>
      </div>

      <AssetSheet state={sheet} spaceId={spaceId} onClose={() => setSheet({ open: false, editing: null })} />
    </div>
  );
}

function GroupList({
  groups,
  hidden,
  tone,
}: {
  groups: { label: string; value: Cents; icon: string; detail?: string; action?: () => void }[];
  hidden: boolean;
  tone: string;
}) {
  const shown = groups.filter((g) => g.value > 0);
  if (!shown.length) return <p className="text-[14px] text-ink-3">Nada por aqui.</p>;
  return (
    <ul className="divide-y divide-line">
      {shown.map((g) => (
        <li key={g.label}>
          <button type="button" onClick={g.action} disabled={!g.action} className="flex min-h-12 w-full items-center gap-3 py-2 text-left disabled:cursor-default">
            <span className="text-[18px]" aria-hidden>
              {g.icon}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[14px] text-ink">{g.label}</span>
              {g.detail ? <span className="block text-[12px] text-ink-3">{g.detail}</span> : null}
            </span>
            <span className={cn('tnum shrink-0 text-[15px] font-semibold', tone)}>{formatMoney(g.value, { hidden })}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** a linha do patrimônio no período; o último ponto é hoje */
function NetLine({ points, labels, hidden }: { points: Cents[]; labels: string[]; hidden: boolean }) {
  const W = 600;
  const H = 120;
  const P = 10;
  if (points.length < 2) return null;
  const max = Math.max(...points);
  const min = Math.min(...points);
  const span = max - min || Math.max(1, Math.abs(max));
  const x = (i: number) => P + (i / (points.length - 1)) * (W - P * 2);
  const y = (v: number) => P + (1 - (v - min) / span) * (H - P * 2);
  const path = points.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${path} L${x(points.length - 1).toFixed(1)},${H - P} L${x(0).toFixed(1)},${H - P} Z`;
  const up = points[points.length - 1] >= points[0];

  return (
    <div className="mt-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[120px] w-full" role="img" aria-label={hidden ? 'Evolução do patrimônio' : `Evolução do patrimônio: de ${formatMoney(points[0])} para ${formatMoney(points[points.length - 1])}`}>
        <defs>
          <linearGradient id="net-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={up ? 'var(--in)' : 'var(--out)'} stopOpacity="0.18" />
            <stop offset="100%" stopColor={up ? 'var(--in)' : 'var(--out)'} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#net-area)" />
        <path d={path} fill="none" stroke={up ? 'var(--in)' : 'var(--out)'} strokeWidth="2.4" strokeLinejoin="round" />
        <circle cx={x(points.length - 1)} cy={y(points[points.length - 1])} r="4.5" fill={up ? 'var(--in)' : 'var(--out)'} />
      </svg>
      <div className="flex justify-between text-[11px] text-ink-3">
        <span>{formatMonthLabel(labels[0], { short: true })}</span>
        <span>hoje</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ folha */

function AssetSheet({
  state,
  spaceId,
  onClose,
}: {
  state: { open: boolean; editing: Asset | null };
  spaceId: string;
  onClose: () => void;
}) {
  const editing = state.editing;
  const [kind, setKind] = React.useState<Asset['kind']>('other');
  const [name, setName] = React.useState('');
  const [icon, setIcon] = React.useState('📦');
  const [valueText, setValueText] = React.useState('');
  const [fipe, setFipe] = React.useState<FipeRef | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const [loadedFor, setLoadedFor] = React.useState('');
  const signature = `${state.open}:${editing?.id ?? 'novo'}`;
  if (state.open && loadedFor !== signature) {
    setLoadedFor(signature);
    setKind(editing?.kind ?? 'other');
    setName(editing?.name ?? '');
    setIcon(editing?.icon ?? '📦');
    setValueText(editing ? String(editing.value / 100).replace('.', ',') : '');
    setFipe(editing?.fipe ?? null);
    setError(null);
  }

  const changeKind = (next: Asset['kind']) => {
    setKind(next);
    setIcon(ASSET_ICONS[next][0]);
    if (next !== 'vehicle') setFipe(null);
  };

  async function submit() {
    const value = parseMoney(valueText);
    if (!name.trim()) return setError('Dê um nome ao bem.');
    if (value === null || value < 0) return setError('Informe o valor.');

    const payload = { spaceId, name, kind, icon, value, fipe };
    if (editing) await updateAsset(editing, payload);
    else await createAsset(payload);
      toast(editing ? 'Bem atualizado.' : 'Bem cadastrado. Ele já soma no seu patrimônio.');
    onClose();
  }

  return (
    <Sheet
      open={state.open}
      onClose={onClose}
      title={editing ? 'Editar bem' : 'Novo bem'}
      footer={
        <div className="grid gap-2">
          <Button variant="primary" size="lg" className="w-full" onClick={submit}>
            Salvar
          </Button>
          {editing && (
            <Button
              variant="danger"
              className="w-full"
              onClick={async () => {
                if (!(await confirmAction({ title: `Apagar ${editing.name}?`, description: 'O bem sai do seu patrimônio.', confirmLabel: 'Apagar', danger: true }))) return;
                await removeAsset(editing.id);
                toast('Bem removido do patrimônio.');
                onClose();
              }}
            >
              <Trash2 size={15} />
              Apagar bem
            </Button>
          )}
        </div>
      }
    >
      <div className="grid gap-4">
        <Segmented
          label="Tipo do bem"
          value={kind}
          onChange={changeKind}
          options={[
            { value: 'property' as const, label: 'Imóvel' },
            { value: 'vehicle' as const, label: 'Veículo' },
            { value: 'other' as const, label: 'Outro' },
          ]}
        />

        {kind === 'vehicle' && (
          <FipePicker
            value={fipe}
            onPick={(ref, price, label) => {
              setFipe(ref);
              setValueText(String(price / 100).replace('.', ','));
              if (!name.trim()) setName(label);
            }}
          />
        )}

        <Field label="Nome" htmlFor="asset-name">
          <Input id="asset-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Ícone</p>
          <div className="flex flex-wrap gap-2">
            {ASSET_ICONS[kind].map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => setIcon(emoji)}
                aria-pressed={icon === emoji}
                aria-label={`Ícone ${emoji}`}
                className={cn(
                  'grid h-10 w-10 place-items-center rounded-field text-[19px] transition-colors',
                  icon === emoji ? 'bg-accent-soft ring-1 ring-accent' : 'bg-surface-2 hover:bg-surface-3',
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>

        <Field
          label="Valor"
          htmlFor="asset-value"
          hint={fipe ? 'Preenchido pela tabela FIPE; pode ajustar à mão.' : undefined}
        >
          <Input
            id="asset-value"
            value={valueText}
            onChange={(e) => setValueText(e.target.value)}
            inputMode="decimal"
            className="tnum text-[17px] font-semibold"
            placeholder="0,00"
          />
        </Field>

        {error && <p className="text-[13px] text-out">{error}</p>}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------ seletor FIPE */

interface FipeOption {
  codigo: string;
  nome: string;
}

/**
 * Busca encadeada na FIPE: tipo, marca, modelo, ano.
 *
 * Cada passo só carrega quando o anterior é escolhido — a lista de modelos de
 * uma marca tem centenas de itens, e baixar todas de uma vez seria megabytes
 * para nada.
 */
function FipePicker({
  value,
  onPick,
}: {
  value: FipeRef | null;
  onPick: (ref: FipeRef, price: number, label: string) => void;
}) {
  const [vehicleType, setVehicleType] = React.useState<FipeRef['vehicleType']>(
    value?.vehicleType ?? 'carros',
  );
  const [brands, setBrands] = React.useState<FipeOption[]>([]);
  const [models, setModels] = React.useState<FipeOption[]>([]);
  const [years, setYears] = React.useState<FipeOption[]>([]);
  const [brand, setBrand] = React.useState(value?.brandCode ?? '');
  const [model, setModel] = React.useState(value?.modelCode ?? '');
  const [busy, setBusy] = React.useState(false);
  const [problem, setProblem] = React.useState<string | null>(null);

  const load = React.useCallback(async (path: string) => {
    const res = await fetch(`/api/fipe?path=${encodeURIComponent(path)}`);
    if (!res.ok) throw new Error('A FIPE não respondeu agora.');
    return res.json();
  }, []);

  // as marcas do tipo escolhido; trocar o tipo zera o resto da cadeia
  React.useEffect(() => {
    let alive = true;

    const run = async () => {
      // o estado muda depois do primeiro paint, e não durante ele
      await Promise.resolve();
      if (!alive) return;
      setBusy(true);
      setProblem(null);
      try {
        const rows: FipeOption[] = await load(`${vehicleType}/marcas`);
        if (alive) setBrands(Array.isArray(rows) ? rows : []);
      } catch (err: unknown) {
        if (alive) setProblem(err instanceof Error ? err.message : 'Falhou');
      } finally {
        if (alive) setBusy(false);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [vehicleType, load]);

  async function pickBrand(code: string) {
    setBrand(code);
    setModel('');
    setModels([]);
    setYears([]);
    if (!code) return;
    setBusy(true);
    try {
      const data = await load(`${vehicleType}/marcas/${code}/modelos`);
      setModels(Array.isArray(data?.modelos) ? data.modelos : []);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Falhou');
    } finally {
      setBusy(false);
    }
  }

  async function pickModel(code: string) {
    setModel(code);
    setYears([]);
    if (!code) return;
    setBusy(true);
    try {
      const rows = await load(`${vehicleType}/marcas/${brand}/modelos/${code}/anos`);
      setYears(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Falhou');
    } finally {
      setBusy(false);
    }
  }

  async function pickYear(yearCode: string) {
    if (!yearCode) return;
    setBusy(true);
    try {
      const data = await load(`${vehicleType}/marcas/${brand}/modelos/${model}/anos/${yearCode}`);
      const price = parseMoney(String(data?.Valor ?? '')) ?? 0;
      const label = `${data?.Modelo ?? ''} ${data?.AnoModelo ?? ''}`.trim();
      onPick(
        {
          vehicleType,
          brandCode: brand,
          modelCode: model,
          yearCode,
          label,
          checkedAt: nowInstant(),
        },
        price,
        label,
      );
    } catch (err) {
      setProblem(err instanceof Error ? err.message : 'Falhou');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-3 rounded-card border border-line bg-surface-2 p-3">
      <p className="flex items-center gap-2 text-[13px] font-medium text-ink-2">
        Buscar na tabela FIPE
        {busy && <RefreshCw size={13} className="animate-spin text-ink-3" />}
      </p>

      <Segmented
        label="Tipo de veículo"
        value={vehicleType}
        onChange={(v) => {
          setVehicleType(v);
          setBrand('');
          setModel('');
          setModels([]);
          setYears([]);
        }}
        options={[
          { value: 'carros' as const, label: 'Carros' },
          { value: 'motos' as const, label: 'Motos' },
          { value: 'caminhoes' as const, label: 'Caminhões' },
        ]}
      />

      <Select value={brand} onChange={(e) => pickBrand(e.target.value)} aria-label="Marca">
        <option value="">Marca</option>
        {brands.map((b) => (
          <option key={b.codigo} value={b.codigo}>
            {b.nome}
          </option>
        ))}
      </Select>

      {models.length > 0 && (
        <Select value={model} onChange={(e) => pickModel(e.target.value)} aria-label="Modelo">
          <option value="">Modelo</option>
          {models.map((m) => (
            <option key={m.codigo} value={m.codigo}>
              {m.nome}
            </option>
          ))}
        </Select>
      )}

      {years.length > 0 && (
        <Select defaultValue="" onChange={(e) => pickYear(e.target.value)} aria-label="Ano">
          <option value="">Ano</option>
          {years.map((y) => (
            <option key={y.codigo} value={y.codigo}>
              {y.nome}
            </option>
          ))}
        </Select>
      )}

      {value && (
        <p className="text-[12px] text-in">
          {value.label} · valor trazido da FIPE
        </p>
      )}

      {problem && <p className="text-[12px] text-out">{problem}</p>}
    </div>
  );
}
