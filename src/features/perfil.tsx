'use client';

import * as React from 'react';
import { ChevronRight, Download, Moon, Sun, Trash2, Upload } from 'lucide-react';
import { Avatar } from '@/components/shell';
import { Button, Field, Input, Panel, SectionTitle, Sheet } from '@/components/ui';
import { BRAND } from '@/lib/brand';
import { cn } from '@/lib/cn';
import { db, putRecord, wipeLocal } from '@/lib/db';
import { formatDateFull } from '@/lib/dates';
import type { Route } from '@/lib/nav';
import type { Settings } from '@/lib/types';

/* ------------------------------------------------------------------- tela */

export function PerfilView({
  settings,
  onToggleTheme,
  isLight,
  account,
  demo = false,
  onGo,
}: {
  settings: Settings | null;
  onToggleTheme: () => void;
  isLight: boolean;
  /** o cartao de conta na nuvem, montado pela tela principal */
  account?: React.ReactNode;
  demo?: boolean;
  onGo?: (route: Route) => void;
}) {
  const [editing, setEditing] = React.useState<null | keyof Settings>(null);
  const [exporting, setExporting] = React.useState(false);

  if (!settings) return null;

  const name = settings.displayName.trim() || 'você';

  const patch = (changes: Partial<Settings>) => putRecord('settings', { ...settings, ...changes });

  return (
    <div className="grid gap-4 pt-2">
      <div className="flex flex-col items-center gap-2 py-4">
        <Avatar name={name} size={76} />
        <p className="font-display text-[26px] text-ink">{name}</p>
        {settings.bio && (
          <p className="max-w-[30ch] text-center text-[13px] leading-relaxed text-ink-3">
            {settings.bio}
          </p>
        )}
      </div>

      <Panel className="px-5 py-2">
        <SectionTitle>Sobre você</SectionTitle>
        <Row label="Nome" value={settings.displayName || 'Não informado'} onClick={() => setEditing('displayName')} />
        <Row label="Bio" value={settings.bio || 'Não informada'} onClick={() => setEditing('bio')} />
        <Row
          label="Nascimento"
          value={settings.birthDate ? formatDateFull(settings.birthDate) : 'Não informado'}
          onClick={() => setEditing('birthDate')}
        />
        <Row label="Localização" value={settings.location || 'Não informada'} onClick={() => setEditing('location')} />
        <Row label="Telefone" value={settings.phone || 'Não informado'} onClick={() => setEditing('phone')} last />
      </Panel>

      {account}

      <Panel className="px-5 py-2">
        <SectionTitle>Aparência</SectionTitle>
        <button
          type="button"
          onClick={onToggleTheme}
          className="flex w-full items-center justify-between gap-3 border-b border-line py-3.5 text-left last:border-0"
        >
          <span className="min-w-0">
            <span className="block text-[12px] text-ink-3">Tema</span>
            <span className="block text-[15px] text-ink">{isLight ? 'Claro' : 'Escuro'}</span>
          </span>
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-2 text-ink-2">
            {isLight ? <Sun size={17} /> : <Moon size={17} />}
          </span>
        </button>

        <Toggle
          label="Esconder valores"
          detail="Some com os números da tela"
          checked={settings.privateMode}
          onChange={(v) => patch({ privateMode: v })}
        />
        {onGo ? <Row label="Categorias" value="Nomes e ícones" onClick={() => onGo({ view: 'categorias' })} last /> : null}
      </Panel>

      <Panel className="px-5 py-2">
        <SectionTitle>Funcionalidades</SectionTitle>
        <Toggle
          label="Cartões"
          detail="Desligar tira a fatura das despesas e esconde o pagamento por cartão"
          checked={settings.cardsEnabled}
          onChange={(v) => patch({ cardsEnabled: v })}
        />
        <Toggle
          label="News"
          detail="Notícias e indicadores no início e no menu"
          checked={settings.newsEnabled}
          onChange={(v) => patch({ newsEnabled: v })}
          last
        />
      </Panel>

      <Panel className="px-5 py-2">
        <SectionTitle>Seus dados</SectionTitle>
        <button
          type="button"
          onClick={async () => {
            setExporting(true);
            await exportBackup();
            setExporting(false);
          }}
          className="flex w-full items-center justify-between gap-3 border-b border-line py-3.5 text-left"
        >
          <span className="min-w-0">
            <span className="block text-[15px] text-ink">Exportar</span>
            <span className="block text-[12px] text-ink-3">
              {exporting ? 'Gerando arquivo…' : 'Baixa tudo num arquivo JSON'}
            </span>
          </span>
          <Download size={17} className="shrink-0 text-ink-3" />
        </button>

        <ImportRow />
      </Panel>

      {demo ? null : (
      <Panel className="border-out/25 px-5 py-2">
        <SectionTitle>Zona de risco</SectionTitle>
        <button
          type="button"
          onClick={async () => {
            if (!confirm('Apagar TODOS os dados deste aparelho? Isso não tem volta.')) return;
            if (!confirm('Tem certeza mesmo? Exporte antes se quiser guardar.')) return;
            await wipeLocal();
            location.reload();
          }}
          className="flex w-full items-center justify-between gap-3 py-3.5 text-left"
        >
          <span className="min-w-0">
            <span className="block text-[15px] text-out">Apagar todos os dados</span>
            <span className="block text-[12px] text-ink-3">Definitivo, sem volta</span>
          </span>
          <Trash2 size={17} className="shrink-0 text-out" />
        </button>
      </Panel>
      )}

      <p className="px-1 pb-2 text-center text-[12px] text-ink-3">
        {BRAND.name} · seus dados ficam neste aparelho
      </p>

      <FieldSheet
        field={editing}
        settings={settings}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ peças */

function Row({
  label,
  value,
  onClick,
  last,
}: {
  label: string;
  value: string;
  onClick: () => void;
  last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex w-full items-center justify-between gap-3 py-3.5 text-left',
        !last && 'border-b border-line',
      )}
    >
      <span className="min-w-0">
        <span className="block text-[12px] text-ink-3">{label}</span>
        <span className="block truncate text-[15px] text-ink">{value}</span>
      </span>
      <ChevronRight size={17} className="shrink-0 text-ink-3" />
    </button>
  );
}

function Toggle({
  label,
  detail,
  checked,
  onChange,
  last,
}: {
  label: string;
  detail: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  last?: boolean;
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer items-center justify-between gap-3 py-3.5',
        !last && 'border-b border-line',
      )}
    >
      <span className="min-w-0">
        <span className="block text-[15px] text-ink">{label}</span>
        <span className="block text-[12px] leading-relaxed text-ink-3">{detail}</span>
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 accent-[var(--accent)]"
      />
    </label>
  );
}

/* ----------------------------------------------------- edição de um campo */

const FIELD_META: Partial<Record<keyof Settings, { title: string; hint?: string; type?: string }>> = {
  displayName: { title: 'Seu nome', hint: 'É como o app vai te chamar.' },
  bio: { title: 'Bio' },
  birthDate: { title: 'Nascimento', type: 'date' },
  location: { title: 'Localização', hint: 'Cidade e estado' },
  phone: { title: 'Telefone' },
};

function FieldSheet({
  field,
  settings,
  onClose,
}: {
  field: keyof Settings | null;
  settings: Settings;
  onClose: () => void;
}) {
  const meta = field ? FIELD_META[field] : null;
  const [value, setValue] = React.useState('');

  const [loadedFor, setLoadedFor] = React.useState<string>('');
  if (field && loadedFor !== field) {
    setLoadedFor(field);
    setValue(String(settings[field] ?? ''));
  }

  if (!field || !meta) return null;

  return (
    <Sheet
      open
      onClose={onClose}
      title={meta.title}
      footer={
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={async () => {
            await putRecord('settings', { ...settings, [field]: value.trim() || (meta.type === 'date' ? null : '') });
            onClose();
          }}
        >
          Salvar
        </Button>
      }
    >
      <Field label={meta.title} htmlFor="profile-field" hint={meta.hint}>
        <Input
          id="profile-field"
          type={meta.type ?? 'text'}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
        />
      </Field>
    </Sheet>
  );
}

/* ---------------------------------------------------------- backup local */

/**
 * Exporta tudo num JSON.
 *
 * É a saída de emergência: enquanto não existe conta na nuvem, é o que garante
 * que trocar de aparelho não signifique recomeçar. Os binários dos
 * comprovantes ficam de fora — um backup de texto tem que caber num e-mail.
 */
async function exportBackup(): Promise<void> {
  const d = db();
  const payload = {
    app: BRAND.name,
    version: 1,
    exportedAt: new Date().toISOString(),
    spaces: await d.spaces.toArray(),
    categories: await d.categories.toArray(),
    accounts: await d.accounts.toArray(),
    cards: await d.cards.toArray(),
    entries: await d.entries.toArray(),
    subscriptions: await d.subscriptions.toArray(),
    goals: await d.goals.toArray(),
    debts: await d.debts.toArray(),
    splits: await d.splits.toArray(),
    budgets: await d.budgets.toArray(),
    assets: await d.assets.toArray(),
    folders: await d.folders.toArray(),
    attachments: await d.attachments.toArray(),
    settings: await d.settings.toArray(),
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${BRAND.name.toLowerCase()}-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 400);
}

function ImportRow() {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [status, setStatus] = React.useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setStatus('Lendo arquivo…');
    try {
      const payload = JSON.parse(await file.text()) as Record<string, unknown>;
      const d = db();
      let restored = 0;

      const tables = [
        'categories', 'accounts', 'cards', 'entries', 'subscriptions',
        'goals', 'debts', 'splits', 'budgets', 'assets', 'folders', 'attachments',
      ] as const;

      for (const table of tables) {
        const rows = payload[table];
        if (!Array.isArray(rows) || !rows.length) continue;
        // bulkPut por id: reimportar o mesmo arquivo repõe, não duplica
        await (d[table] as unknown as { bulkPut: (r: unknown[]) => Promise<unknown> }).bulkPut(rows);
        restored += rows.length;
      }

      setStatus(`${restored} registros restaurados. Recarregando…`);
      setTimeout(() => location.reload(), 1200);
    } catch {
      setStatus('Não consegui ler esse arquivo. Ele veio da exportação?');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-between gap-3 py-3.5 text-left"
      >
        <span className="min-w-0">
          <span className="block text-[15px] text-ink">Importar</span>
          <span className="block text-[12px] text-ink-3">
            {status ?? 'Restaura a partir de um backup exportado'}
          </span>
        </span>
        <Upload size={17} className="shrink-0 text-ink-3" />
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => onFile(e.target.files?.[0])}
      />
    </>
  );
}
