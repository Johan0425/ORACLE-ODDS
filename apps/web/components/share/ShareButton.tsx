'use client';

import { useState } from 'react';
import { ShareComposer, type ShareEntity } from './ShareComposer';

export function ShareButton({ entityType, entityId, label = 'Compartir' }: { entityType: ShareEntity; entityId: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-ghost" onClick={() => setOpen(true)} data-testid="share-open">
        {label}
      </button>
      {open && <ShareComposer entityType={entityType} entityId={entityId} onClose={() => setOpen(false)} />}
    </>
  );
}
