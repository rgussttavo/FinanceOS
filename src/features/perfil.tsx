'use client';

import * as React from 'react';
import { ChevronRight, Cloud, CloudOff, Download, FlaskConical, ShieldCheck, Smartphone, Trash2, Upload, UserRound } from 'lucide-react';
import { InstallSheet, useInstallState } from '@/components/pwa';
import { Avatar } from '@/components/shell';
import { Button, Field, Input, Panel, SectionTitle, Segmented, Sheet, Switch, confirmAction, toast } from '@/components/ui';
import { BRAND } from '@/lib/brand';
import { normalize } from '@/lib/categories';
import { cn } from '@/lib/cn';
import { db, deleteRecord, putRecord, putRecords, wipeLocal } from '@/lib/db';
import { formatDateFull } from '@/lib/dates';
import type { Route } from '@/lib/nav';
import { applyTheme, useThemeChoice } from '@/lib/theme';
import type { Category, Settings, SyncTable, ThemeChoice } from '@/lib/types';

/**
 * Ajustes: quem é você, como o app se comporta, onde seus dados estão.
 *
 * A seção de privacidade descreve o que o código faz — nem mais, nem menos.
 * Se um dia algo passar a sair do aparelho, este texto muda junto.
 */

const THEMES: { value: ThemeChoice; label: string }[] = [
  { value: 'dark', label: 'Escuro' },
  { value: 'light', label: 'Claro' },
  { value: 'system', label: 'Automático' },
];

/** os blocos do Início que dá para esconder, com o mesmo nome que têm na tela */
const BLOCKS: { id: string; label: string; detail: string; news?: boolean }[] = [
  { id: 'cobertura', label: 'Seu mês completo', detail: 'O que falta para os números baterem com o banco' },
  { id: 'timeline', label: 'O que vem por aí', detail: 'Entradas e saídas dos próximos dias, com o saldo' },
  { id: 'atencao', label: 'O que merece sua atenção', detail: 'Alertas com a ação para resolver' },
  { id: 'saude', label: 'Saúde do mês', detail: 'A nota do mês e o que pesa nela' },
  { id: 'acoes', label: 'Ações rápidas', detail: 'Atalhos para registrar e importar' },
  { id: 'resumo', label: 'Como está seu mês', detail: 'Quanto entrou, saiu e foi investido' },
  { id: 'news', label: 'Notícias', detail: 'As últimas manchetes de economia', news: true },
];

export function PerfilView({
  spaceId,
  settings,
  account,
  demo = false,
  signedIn = false,
  onGo,
}: {
  spaceId: string;
  settings: Settings | null;
  /** o cartão de conta na nuvem, montado pela tela principal */
  account?: React.ReactNode;
  demo?: boolean;
  signedIn?: boolean;
  onGo: (route: Route) => void;
}) {
  const [editing, setEditing] = React.useState<null | keyof Settings>(null);
  const [installing, setInstalling] = React.useState(false);
  const theme = useThemeChoice();
  const install = useInstallState();

  if (!settings) return null;

  const name = settings.displayName.trim() || 'você';
  const hiddenBlocks = new Set(settings.hiddenBlocks ?? []);
  const patch = (changes: Partial<Settings>) => putRecord('settings', { ...settings, ...changes });

  const toggleBlock = (id: string, visible: boolean) => {
    const next = new Set(hiddenBlocks);
    if (visible) next.delete(id);
    else next.add(id);
    void patch({ hiddenBlocks: [...next] });
  };

  return (
    <div className="mx-auto grid w-full max-w-[720px] gap-4 pt-2">
      <div className="flex flex-col items-center gap-2 py-4">
        {settings.displayName.trim() ? (
          <>
            <Avatar name={name} size={76} />
            <p className="font-display text-[26px] text-ink">{name}</p>
          </>
        ) : (
          <>
            <span className="grid size-[76px] place-items-center rounded-full bg-surface-2 text-ink-3" aria-hidden>
              <UserRound size={34} />
            </span>
            <p className="font-display text-[26px] text-ink">Seu perfil</p>
            <button type="button" onClick={() => setEditing('displayName')} className="text-[13px] font-semibold text-accent hover:underline">
              Como quer ser chamado?
            </button>
          </>
        )}
        {settings.bio ? <p className="max-w-[30ch] text-center text-[13px] leading-relaxed text-ink-3">{settings.bio}</p> : null}
      </div>

      <Panel className="px-5 py-2">
        <SectionTitle as="h2">Sobre você</SectionTitle>
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

      <Panel className="px-5 py-2">
        <SectionTitle as="h2">Preferências</SectionTitle>
        <div className="border-b border-line py-3.5">
          <p id="theme-label" className="mb-2 text-[15px] text-ink">
            Tema
          </p>
          <Segmented label="Tema" value={theme} onChange={applyTheme} options={THEMES} />
          <p className="mt-2 text-[12px] leading-relaxed text-ink-3">
            {theme === 'system' ? 'Acompanha o claro e o escuro do sistema.' : 'Vale para este aparelho.'}
          </p>
        </div>
        <Switch
          label="Esconder valores"
          detail="Troca os valores por •••• em todas as telas. Útil em público."
          checked={settings.privateMode}
          onChange={(v) => void patch({ privateMode: v })}
          className="border-b border-line"
        />
        <Row label="Categorias" value="Nomes, ícones e novas categorias" onClick={() => onGo({ view: 'categorias' })} last={install === 'installed'} />
        {install !== 'installed' ? (
          <Row label="Aplicativo" value="Instalar o FinanceOS neste aparelho" onClick={() => setInstalling(true)} icon={<Smartphone size={17} />} last />
        ) : null}
      </Panel>

      <Panel className="px-5 py-2">
        <SectionTitle as="h2">O que aparece no Início</SectionTitle>
        {BLOCKS.filter((b) => !b.news || settings.newsEnabled).map((b, i, list) => (
          <Switch
            key={b.id}
            label={b.label}
            detail={b.detail}
            checked={!hiddenBlocks.has(b.id)}
            onChange={(v) => toggleBlock(b.id, v)}
            className={cn(i < list.length - 1 && 'border-b border-line')}
          />
        ))}
        <p className="pb-3 text-[12px] leading-relaxed text-ink-3">
          O saldo disponível fica sempre no topo — é a resposta que o Início existe para dar.
        </p>
      </Panel>

      <Panel className="px-5 py-2">
        <SectionTitle as="h2">Funcionalidades</SectionTitle>
        <Switch
          label="Cartões de crédito"
          detail="Desligado, as compras saem na data da compra e não há fatura"
          checked={settings.cardsEnabled}
          onChange={(v) => void patch({ cardsEnabled: v })}
          className="border-b border-line"
        />
        <Switch
          label="Notícias"
          detail="Manchetes e indicadores no Início e no menu"
          checked={settings.newsEnabled}
          onChange={(v) => void patch({ newsEnabled: v })}
        />
      </Panel>

      {account}

      <PrivacyPanel demo={demo} signedIn={signedIn} />

      <DataPanel spaceId={spaceId} settings={settings} />

      {demo ? null : <DangerPanel signedIn={signedIn} />}

      <p className="px-1 pb-2 text-center text-[12px] text-ink-3">
        {BRAND.name} · {demo ? 'demonstração com dados fictícios' : signedIn ? 'sincronizado com a sua conta' : 'seus dados ficam neste aparelho'}
      </p>

      <FieldSheet field={editing} settings={settings} onClose={() => setEditing(null)} />
      <InstallSheet open={installing} onClose={() => setInstalling(false)} />
    </div>
  );
}

/* ------------------------------------------------------------- privacidade */

function PrivacyPanel({ demo, signedIn }: { demo: boolean; signedIn: boolean }) {
  const status = demo
    ? { icon: <FlaskConical size={15} />, text: 'Demonstração: os dados de exemplo vivem só neste navegador.' }
    : signedIn
      ? { icon: <Cloud size={15} />, text: 'Conta ligada: uma cópia sincroniza com o servidor.' }
      : { icon: <CloudOff size={15} />, text: 'Sem conta: nada sai deste aparelho.' };

  const points = [
    'Lançamentos, cartões, metas e preferências ficam guardados neste navegador.',
    'Com uma conta, uma cópia desses dados e dos comprovantes anexados vai para o servidor do FinanceOS (Supabase), ligada só a você, para sincronizar entre aparelhos.',
    'O extrato bancário é lido aqui mesmo, no navegador. O arquivo não é enviado.',
    'A busca e o assistente calculam as respostas no aparelho.',
    'Os logotipos de assinaturas e cartões vêm de serviços públicos de ícones (Clearbit, DuckDuckGo e Google), que recebem só o endereço do serviço — por exemplo, netflix.com.',
    'Cotações, notícias e a tabela FIPE passam pelo servidor do FinanceOS. Sai só a consulta; seus lançamentos, nunca.',
    'O FinanceOS nunca pede senha de banco.',
  ];

  return (
    <Panel className="px-5 py-4">
      <SectionTitle as="h2">Privacidade</SectionTitle>
      <p className="flex items-center gap-2 rounded-field bg-surface-2 px-3 py-2 text-[13px] font-medium text-ink">
        <span className="text-accent" aria-hidden>
          {status.icon}
        </span>
        {status.text}
      </p>
      <ul className="mt-3 grid gap-2.5">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-2.5 text-[13px] leading-relaxed text-ink-2">
            <ShieldCheck size={15} className="mt-0.5 shrink-0 text-in" aria-hidden />
            {p}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ------------------------------------------------------------- seus dados */

function DataPanel({ spaceId, settings }: { spaceId: string; settings: Settings }) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState<null | 'export' | 'restore'>(null);

  async function onExport() {
    setBusy('export');
    try {
      const file = await exportBackup();
      toast(`Backup concluído: ${file}.`);
    } catch {
      toast('Não consegui gerar o arquivo. Tente de novo.', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  async function onFile(file: File | undefined) {
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    let payload: Backup;
    try {
      payload = await readBackup(file);
    } catch {
      toast('Esse arquivo não parece um backup do FinanceOS.', { tone: 'error' });
      return;
    }
    const count = RESTORE_TABLES.reduce((n, t) => n + rowsOf(payload, t).length, 0);
    const ok = await confirmAction({
      title: 'Restaurar este backup?',
      description: `${count} ${count === 1 ? 'registro entra' : 'registros entram'} neste aparelho${
        payload.exportedAt ? `, do backup de ${formatDateFull(payload.exportedAt.slice(0, 10))}` : ''
      }. O que já está aqui continua; o que tiver o mesmo registro no arquivo fica com a versão dele.`,
      confirmLabel: 'Restaurar',
    });
    if (!ok) return;
    setBusy('restore');
    try {
      const restored = await restoreBackup(payload, spaceId, settings);
      toast(`Backup restaurado: ${restored} ${restored === 1 ? 'registro' : 'registros'}.`);
    } catch {
      toast('A restauração parou no meio. Nada do que já existia foi apagado.', { tone: 'error' });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Panel className="px-5 py-2">
      <SectionTitle as="h2">Seus dados</SectionTitle>
      <ActionRow
        label="Exportar backup"
        detail={busy === 'export' ? 'Gerando o arquivo…' : 'Um arquivo com tudo, para guardar ou levar a outro aparelho'}
        icon={<Download size={17} />}
        onClick={() => void onExport()}
        disabled={busy !== null}
      />
      <ActionRow
        label="Restaurar backup"
        detail={busy === 'restore' ? 'Restaurando…' : 'Traz de volta o que foi exportado daqui ou de outro aparelho'}
        icon={<Upload size={17} />}
        onClick={() => inputRef.current?.click()}
        disabled={busy !== null}
        last
      />
      <input
        ref={inputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
    </Panel>
  );
}

function DangerPanel({ signedIn }: { signedIn: boolean }) {
  async function wipe() {
    const ok = await confirmAction({
      title: 'Apagar todos os dados deste aparelho?',
      description: signedIn
        ? 'Tudo some deste navegador e a conta é desligada aqui. O que já foi sincronizado continua na sua conta.'
        : 'Lançamentos, cartões, metas e preferências somem deste navegador, sem volta. Se quiser guardar, exporte um backup antes.',
      confirmLabel: 'Apagar tudo',
      danger: true,
    });
    if (!ok) return;
    await wipeLocal();
    window.location.reload();
  }

  return (
    <Panel className="border-out/25 px-5 py-2">
      <SectionTitle as="h2">Zona de risco</SectionTitle>
      <ActionRow
        label="Apagar todos os dados"
        detail="Definitivo neste aparelho"
        icon={<Trash2 size={17} />}
        onClick={() => void wipe()}
        danger
        last
      />
    </Panel>
  );
}

/* ------------------------------------------------------------------ peças */

function Row({
  label,
  value,
  onClick,
  last,
  icon,
}: {
  label: string;
  value: string;
  onClick: () => void;
  last?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn('flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left', !last && 'border-b border-line')}
    >
      <span className="min-w-0">
        <span className="block text-[12px] text-ink-3">{label}</span>
        <span className="block truncate text-[15px] text-ink">{value}</span>
      </span>
      <span className="shrink-0 text-ink-3" aria-hidden>
        {icon ?? <ChevronRight size={17} />}
      </span>
    </button>
  );
}

function ActionRow({
  label,
  detail,
  icon,
  onClick,
  disabled,
  danger,
  last,
}: {
  label: string;
  detail: string;
  icon: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex min-h-14 w-full items-center justify-between gap-3 py-3 text-left disabled:opacity-60',
        !last && 'border-b border-line',
      )}
    >
      <span className="min-w-0">
        <span className={cn('block text-[15px]', danger ? 'text-out' : 'text-ink')}>{label}</span>
        <span className="block text-[12px] leading-relaxed text-ink-3">{detail}</span>
      </span>
      <span className={cn('shrink-0', danger ? 'text-out' : 'text-ink-3')} aria-hidden>
        {icon}
      </span>
    </button>
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

function FieldSheet({ field, settings, onClose }: { field: keyof Settings | null; settings: Settings; onClose: () => void }) {
  const meta = field ? FIELD_META[field] : null;
  const [value, setValue] = React.useState('');

  const [loadedFor, setLoadedFor] = React.useState<string>('');
  if (field && loadedFor !== field) {
    setLoadedFor(field);
    setValue(String(settings[field] ?? ''));
  }

  if (!field || !meta) return null;

  async function save() {
    if (!field || !meta) return;
    await putRecord('settings', { ...settings, [field]: value.trim() || (meta.type === 'date' ? null : '') });
    toast('Perfil atualizado.');
    onClose();
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title={meta.title}
      footer={
        <Button variant="primary" size="lg" className="w-full" onClick={() => void save()}>
          Salvar
        </Button>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label={meta.title} htmlFor="profile-field" hint={meta.hint}>
          <Input id="profile-field" type={meta.type ?? 'text'} value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
        </Field>
      </form>
    </Sheet>
  );
}

/* ---------------------------------------------------------- backup local */

/** o que o backup leva e traz; `settings` e as regras aprendidas têm tratamento próprio */
const RESTORE_TABLES = [
  'categories',
  'accounts',
  'cards',
  'entries',
  'subscriptions',
  'goals',
  'debts',
  'splits',
  'budgets',
  'assets',
  'folders',
  'attachments',
] as const satisfies readonly SyncTable[];

/** o que volta das preferências do backup; identificação e datas ficam as daqui */
const PREFERENCE_KEYS = [
  'displayName',
  'bio',
  'birthDate',
  'location',
  'phone',
  'privateMode',
  'cardsEnabled',
  'newsEnabled',
  'hiddenBlocks',
  'onboardedAt',
] as const satisfies readonly (keyof Settings)[];

type Backup = Record<string, unknown> & { exportedAt?: string };
type BackupRow = { id: string; spaceId?: string } & Record<string, unknown>;

function rowsOf(payload: Backup, table: string): BackupRow[] {
  const list = payload[table];
  return Array.isArray(list) ? list.filter((r): r is BackupRow => Boolean(r) && typeof (r as BackupRow).id === 'string') : [];
}

/**
 * Exporta tudo num JSON.
 *
 * É a saída de emergência de quem não usa conta: trocar de aparelho não pode
 * significar recomeçar. Os arquivos dos comprovantes ficam de fora — um backup
 * de texto tem que caber num e-mail.
 */
async function exportBackup(): Promise<string> {
  const d = db();
  const payload = {
    app: BRAND.name,
    version: 2,
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
    learned: await d.learned.toArray(),
  };

  const name = `${BRAND.name.toLowerCase()}-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 400);
  return name;
}

async function readBackup(file: File): Promise<Backup> {
  const payload = JSON.parse(await file.text()) as unknown;
  if (!payload || typeof payload !== 'object' || !Array.isArray((payload as Backup).entries)) {
    throw new Error('não é um backup');
  }
  return payload as Backup;
}

/**
 * Restaura um backup neste aparelho.
 *
 * O arquivo pode ter vindo de outro aparelho, com outro espaço: tudo passa a
 * morar no espaço daqui, senão os registros entrariam e nenhuma tela os veria.
 * E passa pela fila de sync, para quem tem conta ver a restauração nos outros
 * aparelhos também.
 *
 * As categorias-semente deste aparelho que o backup também traz (mesmo nome e
 * tipo) saem, desde que nenhum lançamento daqui as use — sem isso, "Mercado"
 * apareceria duas vezes.
 */
async function restoreBackup(payload: Backup, spaceId: string, settings: Settings): Promise<number> {
  const d = db();

  const incoming = rowsOf(payload, 'categories') as unknown as Category[];
  if (incoming.length) {
    const key = (c: Pick<Category, 'kind' | 'name'>) => `${c.kind}:${normalize(c.name)}`;
    const incomingIds = new Set(incoming.map((c) => c.id));
    const incomingKeys = new Set(incoming.filter((c) => !c.deletedAt).map(key));
    const used = new Set((await d.entries.where('spaceId').equals(spaceId).toArray()).map((e) => e.categoryId));
    for (const c of await d.categories.where('spaceId').equals(spaceId).toArray()) {
      if (c.deletedAt || incomingIds.has(c.id) || used.has(c.id)) continue;
      if (incomingKeys.has(key(c))) await deleteRecord('categories', c.id);
    }
  }

  let restored = 0;
  for (const table of RESTORE_TABLES) {
    const rows = rowsOf(payload, table);
    if (!rows.length) continue;
    await putRecords(table, rows.map((r) => ({ ...r, spaceId })) as unknown as Parameters<typeof putRecords>[1]);
    restored += rows.length;
  }

  // o perfil e as escolhas do backup, no registro de preferências deste aparelho
  const saved = rowsOf(payload, 'settings')[0];
  if (saved) {
    const prefs = Object.fromEntries(PREFERENCE_KEYS.filter((k) => k in saved).map((k) => [k, saved[k]])) as Partial<Settings>;
    await putRecord('settings', { ...settings, ...prefs });
  }

  // as regras que o app aprendeu com as correções não sincronizam; vêm pelo arquivo
  const learned = rowsOf(payload, 'learned');
  if (learned.length) await d.learned.bulkPut(learned as unknown as Parameters<typeof d.learned.bulkPut>[0]);

  return restored;
}
