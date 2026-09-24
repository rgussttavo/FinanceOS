'use client';

import * as React from 'react';
import { Plus } from 'lucide-react';
import { Button, Field, Input, Panel, Segmented, SectionTitle, Sheet, confirmAction, toast } from '@/components/ui';
import { deleteRecord, putRecord } from '@/lib/db';
import { nowInstant } from '@/lib/dates';
import { uid } from '@/lib/provision';
import type { Category, FlowKind } from '@/lib/types';

/**
 * As categorias da pessoa, com os nomes dela.
 *
 * As sementes vêm prontas e servem para a maioria; aqui dá para renomear,
 * trocar o ícone e criar as que faltam. Categoria de sistema não se apaga —
 * o dicionário de sugestões aponta para ela —, mas pode mudar de nome.
 */

const KINDS: { value: FlowKind; label: string; tone: 'out' | 'in' | 'inv' }[] = [
  { value: 'out', label: 'Saídas', tone: 'out' },
  { value: 'in', label: 'Entradas', tone: 'in' },
  { value: 'invest', label: 'Investimentos', tone: 'inv' },
];

export function CategoriasView({ spaceId, categories }: { spaceId: string; categories: Category[] }) {
  const [kind, setKind] = React.useState<FlowKind>('out');
  const [editing, setEditing] = React.useState<Category | 'new' | null>(null);
  const list = categories.filter((c) => c.kind === kind);

  return (
    <div className="grid gap-4 pt-2 lg:max-w-[640px]">
      <Segmented label="Tipo de categoria" value={kind} onChange={setKind} options={KINDS} />
      <Panel className="px-5 py-3">
        <SectionTitle
          action={
            <Button size="sm" variant="soft" onClick={() => setEditing('new')}>
              <Plus size={15} /> Nova
            </Button>
          }
        >
          {list.length} categorias
        </SectionTitle>
        <ul className="divide-y divide-line">
          {list.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => setEditing(c)}
                className="flex min-h-12 w-full items-center gap-3 py-2 text-left"
              >
                <span className="grid size-9 place-items-center rounded-full bg-surface-2 text-[16px]" aria-hidden>
                  {c.icon}
                </span>
                <span className="flex-1 text-[15px] text-ink">{c.name}</span>
                {c.system ? <span className="text-[12px] text-ink-3">padrão</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </Panel>

      <CategorySheet
        editing={editing}
        kind={kind}
        spaceId={spaceId}
        count={categories.length}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function CategorySheet({
  editing,
  kind,
  spaceId,
  count,
  onClose,
}: {
  editing: Category | 'new' | null;
  kind: FlowKind;
  spaceId: string;
  count: number;
  onClose: () => void;
}) {
  const [name, setName] = React.useState('');
  const [icon, setIcon] = React.useState('🏷️');
  const [seen, setSeen] = React.useState<Category | 'new' | null>(null);
  if (editing !== seen) {
    setSeen(editing);
    setName(editing && editing !== 'new' ? editing.name : '');
    setIcon(editing && editing !== 'new' ? editing.icon : '🏷️');
  }

  const existing = editing && editing !== 'new' ? editing : null;

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (existing) {
      await putRecord('categories', { ...existing, name: trimmed, icon: icon.trim() || existing.icon });
      toast('Categoria atualizada.');
    } else {
      const at = nowInstant();
      await putRecord('categories', {
        id: uid(),
        spaceId,
        createdAt: at,
        updatedAt: at,
        deletedAt: null,
        name: trimmed,
        kind,
        icon: icon.trim() || '🏷️',
        color: '#6e6a5e',
        system: false,
        order: count + 1,
        budget: 0,
      });
      toast('Categoria criada.');
    }
    onClose();
  }

  return (
    <Sheet
      open={editing !== null}
      onClose={onClose}
      title={existing ? 'Editar categoria' : 'Nova categoria'}
      footer={
        <div className="grid gap-2">
          <Button variant="primary" size="lg" onClick={() => void save()} disabled={!name.trim()}>
            Salvar
          </Button>
          {existing && !existing.system ? (
            <Button
              variant="danger"
              onClick={async () => {
                const ok = await confirmAction({
                  title: `Apagar ${existing.name}?`,
                  description: 'Os lançamentos dela ficam sem categoria.',
                  confirmLabel: 'Apagar',
                  danger: true,
                });
                if (!ok) return;
                await deleteRecord('categories', existing.id);
                toast('Categoria apagada.');
                onClose();
              }}
            >
              Apagar categoria
            </Button>
          ) : null}
        </div>
      }
    >
      <form
        className="grid grid-cols-[5rem_minmax(0,1fr)] gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <Field label="Ícone" htmlFor="cat-icon">
          <Input id="cat-icon" value={icon} onChange={(e) => setIcon(e.target.value)} maxLength={4} className="text-center text-[20px]" />
        </Field>
        <Field label="Nome" htmlFor="cat-name">
          <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" data-autofocus />
        </Field>
      </form>
    </Sheet>
  );
}
