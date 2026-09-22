'use client';

import * as React from 'react';
import { Plus, RefreshCw, Trash2 } from 'lucide-react';
import { Button, EmptyState, Field, Input, Panel, SectionTitle, Segmented, Select, Sheet } from '@/components/ui';
import { cn } from '@/lib/cn';
import { nowInstant } from '@/lib/dates';
import { formatMoney, parseMoney } from '@/lib/money';
import { createAsset, removeAsset, updateAsset, useAssets, useMonthsSummary } from '@/lib/store';
import type { Asset, FipeRef, MonthKey } from '@/lib/types';

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

export function PatrimonioView({
  spaceId,
  month,
  hidden,
}: {
  spaceId: string;
  month: MonthKey;
  hidden: boolean;
}) {
  const assets = useAssets(spaceId);
  // a janela longa é o acumulado dos aportes; a carteira com posições reais
  // entra quando os investimentos tiverem saldo próprio
  const history = useMonthsSummary(spaceId, month, 36);
  const [sheet, setSheet] = React.useState<{ open: boolean; editing: Asset | null }>({
    open: false,
    editing: null,
  });

  const inAssets = assets.reduce((sum, a) => sum + a.value, 0);
  const invested = history.reduce((sum, m) => sum + m.invested, 0);
  const total = inAssets + invested;

  return (
    <div className="grid gap-4 pt-2">
      <Panel className="p-5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-3">
          Patrimônio total
        </p>
        <p className="amount mt-1.5 text-[38px] text-ink">
          {hidden ? '••••' : formatMoney(total)}
        </p>

        <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4">
          <div className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wider text-ink-3">Em bens</dt>
            <dd className="tnum mt-1 truncate text-[15px] font-semibold text-ink">
              {formatMoney(inAssets, { hidden, compact: true })}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] uppercase tracking-wider text-ink-3">Investido</dt>
            <dd className="tnum mt-1 truncate text-[15px] font-semibold text-inv">
              {formatMoney(invested, { hidden, compact: true })}
            </dd>
          </div>
        </dl>

        {total > 0 && (
          <div className="mt-4 flex h-2 overflow-hidden rounded-full bg-surface-3">
            <span
              className="h-full bg-accent transition-[width] duration-[var(--t-slow)]"
              style={{ width: `${(inAssets / total) * 100}%` }}
            />
            <span
              className="h-full bg-inv transition-[width] duration-[var(--t-slow)]"
              style={{ width: `${(invested / total) * 100}%` }}
            />
          </div>
        )}
      </Panel>

      <Panel className="px-5 py-4">
        <SectionTitle
          action={
            <button
              type="button"
              aria-label="Cadastrar bem"
              onClick={() => setSheet({ open: true, editing: null })}
              className="grid h-8 w-8 place-items-center rounded-full text-accent transition-colors hover:bg-accent-soft"
            >
              <Plus size={17} />
            </button>
          }
        >
          Seus bens
        </SectionTitle>

        {assets.length ? (
          <ul className="divide-y divide-line">
            {assets.map((asset) => (
              <li key={asset.id}>
                <button
                  type="button"
                  onClick={() => setSheet({ open: true, editing: asset })}
                  className="flex w-full items-center gap-3 py-3.5 text-left"
                >
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-surface-2 text-[18px]">
                    {asset.icon}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-ink">{asset.name}</span>
                    <span className="block truncate text-[12px] text-ink-3">
                      {KIND_LABEL[asset.kind]}
                      {asset.fipe ? ' · valor da tabela FIPE' : ''}
                      {asset.indexedByIpca ? ' · corrigido pelo IPCA' : ''}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-[15px] font-semibold text-ink">
                    {formatMoney(asset.value, { hidden })}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
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

      <AssetSheet
        state={sheet}
        spaceId={spaceId}
        onClose={() => setSheet({ open: false, editing: null })}
      />
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
                if (!confirm(`Apagar ${editing.name}?`)) return;
                await removeAsset(editing.id);
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
