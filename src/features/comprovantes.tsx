'use client';

import * as React from 'react';
import { CloudOff, Download, FolderPlus, Grid2x2, List, Plus, Search, Trash2 } from 'lucide-react';
import { Button, EmptyState, Field, Input, Panel, SectionTitle, Select, Sheet } from '@/components/ui';
import { readFile } from '@/lib/db';
import { cn } from '@/lib/cn';
import { formatDateFull } from '@/lib/dates';
import {
  addAttachment,
  createFolder,
  removeAttachment,
  removeFolder,
  updateAttachment,
  useAttachments,
  useFolders,
} from '@/lib/store';
import type { Attachment, Folder } from '@/lib/types';

const FOLDER_ICONS = ['🏠', '🧾', '🩺', '🚗', '🎓', '💼', '🐶', '📦'] as const;

const formatSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
};

const isImage = (mime: string) => mime.startsWith('image/');

/* --------------------------------------------------------------- miniatura */

/**
 * Miniatura do comprovante.
 *
 * O arquivo vive no IndexedDB, não numa URL: para mostrar, é preciso ler o
 * blob e criar um endereço temporário — que é revogado ao sair, senão cada
 * rolagem pela lista vaza memória.
 */
function Thumb({ attachment, size = 44 }: { attachment: Attachment; size?: number }) {
  const [url, setUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!isImage(attachment.mime)) return;
    let revoke: string | null = null;
    let alive = true;

    readFile(attachment.id).then((blob) => {
      if (!alive || !blob) return;
      revoke = URL.createObjectURL(blob);
      setUrl(revoke);
    });

    return () => {
      alive = false;
      if (revoke) URL.revokeObjectURL(revoke);
    };
  }, [attachment.id, attachment.mime]);

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt=""
        className="shrink-0 rounded-[10px] object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <span
      className="grid shrink-0 place-items-center rounded-[10px] bg-surface-2 text-[16px]"
      style={{ width: size, height: size }}
      aria-hidden
    >
      {attachment.mime.includes('pdf') ? '📄' : isImage(attachment.mime) ? '🖼️' : '🧾'}
    </span>
  );
}

/* ------------------------------------------------------------------- tela */

export function ComprovantesView({ spaceId }: { spaceId: string }) {
  const folders = useFolders(spaceId);
  const attachments = useAttachments(spaceId);

  const [query, setQuery] = React.useState('');
  const [folderId, setFolderId] = React.useState<string | null>(null);
  const [layout, setLayout] = React.useState<'grid' | 'list'>('list');
  const [folderSheet, setFolderSheet] = React.useState(false);
  const [detail, setDetail] = React.useState<Attachment | null>(null);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return attachments.filter((a) => {
      if (folderId && a.folderId !== folderId) return false;
      if (!q) return true;
      return a.name.toLowerCase().includes(q);
    });
  }, [attachments, query, folderId]);

  const countIn = (id: string) => attachments.filter((a) => a.folderId === id).length;

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      await addAttachment(spaceId, file, folderId);
    }
    if (inputRef.current) inputRef.current.value = '';
  }

  return (
    <div className="grid gap-4 pt-2">
      <div className="flex gap-2">
        <span className="relative flex-1">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-3"
          />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar comprovante"
            aria-label="Buscar comprovante"
            className="pl-9"
          />
        </span>
        <Button variant="ghost" onClick={() => inputRef.current?.click()} aria-label="Adicionar comprovante">
          <Plus size={16} />
        </Button>
        <Button variant="ghost" onClick={() => setFolderSheet(true)} aria-label="Nova pasta">
          <FolderPlus size={16} />
        </Button>
        <Button
          variant="ghost"
          onClick={() => setLayout((l) => (l === 'list' ? 'grid' : 'list'))}
          aria-label={layout === 'list' ? 'Ver em grade' : 'Ver em lista'}
        >
          {layout === 'list' ? <Grid2x2 size={16} /> : <List size={16} />}
        </Button>
      </div>

      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => onFiles(e.target.files)}
      />

      {folders.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          <Chip active={folderId === null} onClick={() => setFolderId(null)}>
            Todos ({attachments.length})
          </Chip>
          {folders.map((f) => (
            <Chip key={f.id} active={folderId === f.id} onClick={() => setFolderId(f.id)}>
              {f.icon} {f.name} ({countIn(f.id)})
            </Chip>
          ))}
        </div>
      )}

      <Panel className="px-5 py-4">
        <SectionTitle
          action={<span className="tnum text-[12px] text-ink-3">{visible.length}</span>}
        >
          {folderId ? folders.find((f) => f.id === folderId)?.name ?? 'Pasta' : 'Todos os comprovantes'}
        </SectionTitle>

        {visible.length === 0 ? (
          <EmptyState
            title={query ? 'Nada encontrado' : 'Seus comprovantes, num lugar só'}
            description={
              query
                ? 'Nenhum comprovante com esse nome. Tente outra palavra.'
                : 'Guarde a notinha, o Pix, o boleto pago. Com título e busca, você acha em segundos quando precisar provar um pagamento.'
            }
            action={
              !query ? (
                <Button variant="primary" onClick={() => inputRef.current?.click()}>
                  <Plus size={16} />
                  Adicionar o primeiro
                </Button>
              ) : undefined
            }
          />
        ) : layout === 'list' ? (
          <ul className="divide-y divide-line">
            {visible.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setDetail(a)}
                  className="flex w-full items-center gap-3 py-3 text-left"
                >
                  <Thumb attachment={a} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] text-ink">{a.name}</span>
                    <span className="flex items-center gap-1.5 text-[12px] text-ink-3">
                      {formatSize(a.size)}
                      <span aria-hidden>·</span>
                      {formatDateFull(a.createdAt.slice(0, 10))}
                      {!a.uploaded && (
                        <>
                          <span aria-hidden>·</span>
                          <CloudOff size={11} />
                        </>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="grid grid-cols-3 gap-2.5">
            {visible.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setDetail(a)}
                  className="grid w-full gap-1.5 text-left"
                >
                  <Thumb attachment={a} size={96} />
                  <span className="truncate text-[12px] text-ink-2">{a.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <p className="px-1 text-[12px] leading-relaxed text-ink-3">
        Os arquivos ficam neste aparelho. A cópia na nuvem entra junto com a conta — e, diferente do
        original, vai sincronizar o arquivo em si, não só o nome dele.
      </p>

      <NewFolderSheet
        open={folderSheet}
        spaceId={spaceId}
        onClose={() => setFolderSheet(false)}
      />

      <DetailSheet
        attachment={detail}
        folders={folders}
        onClose={() => setDetail(null)}
      />
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-9 shrink-0 rounded-full border px-3.5 text-[13px] font-medium transition-colors',
        active ? 'border-accent bg-accent-soft text-accent' : 'border-line text-ink-3 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

/* ---------------------------------------------------------------- detalhe */

function DetailSheet({
  attachment,
  folders,
  onClose,
}: {
  attachment: Attachment | null;
  folders: Folder[];
  onClose: () => void;
}) {
  const [name, setName] = React.useState('');
  const [folderId, setFolderId] = React.useState('');

  const [loadedFor, setLoadedFor] = React.useState('');
  if (attachment && loadedFor !== attachment.id) {
    setLoadedFor(attachment.id);
    setName(attachment.name);
    setFolderId(attachment.folderId ?? '');
  }

  async function download() {
    if (!attachment) return;
    const blob = await readFile(attachment.id);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = attachment.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 400);
  }

  if (!attachment) return null;

  return (
    <Sheet
      open
      onClose={onClose}
      title="Comprovante"
      footer={
        <div className="grid gap-2">
          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={async () => {
              await updateAttachment(attachment, { name: name.trim() || attachment.name, folderId: folderId || null });
              onClose();
            }}
          >
            Salvar
          </Button>
          <div className="flex gap-2">
            <Button variant="ghost" className="flex-1" onClick={download}>
              <Download size={15} />
              Baixar
            </Button>
            <Button
              variant="danger"
              onClick={async () => {
                if (!confirm(`Apagar ${attachment.name}?`)) return;
                await removeAttachment(attachment.id);
                onClose();
              }}
            >
              <Trash2 size={15} />
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4">
        <div className="grid place-items-center rounded-card bg-surface-2 py-5">
          <Thumb attachment={attachment} size={160} />
        </div>

        <Field label="Título" htmlFor="att-name" hint="É por este nome que a busca acha.">
          <Input id="att-name" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>

        <Field label="Pasta" htmlFor="att-folder">
          <Select id="att-folder" value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            <option value="">Sem pasta</option>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.icon} {f.name}
              </option>
            ))}
          </Select>
        </Field>

        <p className="text-[12px] text-ink-3">
          {formatSize(attachment.size)} · {attachment.mime}
        </p>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------ nova pasta */

function NewFolderSheet({
  open,
  spaceId,
  onClose,
}: {
  open: boolean;
  spaceId: string;
  onClose: () => void;
}) {
  const [name, setName] = React.useState('');
  const [icon, setIcon] = React.useState<string>(FOLDER_ICONS[0]);
  const folders = useFolders(spaceId);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Pastas"
      footer={
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={async () => {
            if (!name.trim()) return;
            await createFolder(spaceId, name, icon);
            setName('');
            onClose();
          }}
        >
          Criar pasta
        </Button>
      }
    >
      <div className="grid gap-4">
        <Field label="Nome da pasta" htmlFor="folder-name" hint="Ex.: Casa, Impostos, Saúde, Carro">
          <Input id="folder-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" />
        </Field>

        <div>
          <p className="mb-2 text-[13px] font-medium text-ink-2">Ícone</p>
          <div className="flex flex-wrap gap-2">
            {FOLDER_ICONS.map((emoji) => (
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

        {folders.length > 0 && (
          <div>
            <p className="mb-2 text-[13px] font-medium text-ink-2">Pastas existentes</p>
            <ul className="divide-y divide-line">
              {folders.map((f) => (
                <li key={f.id} className="flex items-center gap-3 py-2.5">
                  <span className="text-[17px]">{f.icon}</span>
                  <span className="min-w-0 flex-1 truncate text-[14px] text-ink">{f.name}</span>
                  <button
                    type="button"
                    aria-label={`Apagar pasta ${f.name}`}
                    onClick={() => removeFolder(f.id)}
                    className="grid h-8 w-8 place-items-center rounded-full text-ink-3 transition-colors hover:bg-out-soft hover:text-out"
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}
