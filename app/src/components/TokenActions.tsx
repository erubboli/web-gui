import { useState } from 'react';
import IssueTokenModal from './IssueTokenModal';
import IssueNFTModal from './IssueNFTModal';

interface Props {
  ipfsEnabled: boolean;
}

type Modal = 'fungible' | 'nft' | null;

export default function TokenActions({ ipfsEnabled }: Props) {
  const [open, setOpen] = useState<Modal>(null);

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          onClick={() => setOpen('fungible')}
          className="rounded-lg bg-mint-700 hover:bg-mint-600 px-3 py-1.5 text-sm font-semibold text-white transition-colors"
        >
          Issue Token
        </button>
        <button
          onClick={() => setOpen('nft')}
          className="rounded-lg border border-gray-700 hover:bg-gray-800 px-3 py-1.5 text-sm font-semibold text-gray-300 transition-colors"
        >
          Issue NFT
        </button>
      </div>

      {open === 'fungible' && (
        <IssueTokenModal
          ipfsEnabled={ipfsEnabled}
          onClose={() => setOpen(null)}
          onIssued={() => setTimeout(() => window.location.reload(), 3000)}
        />
      )}

      {open === 'nft' && (
        <IssueNFTModal
          ipfsEnabled={ipfsEnabled}
          onClose={() => setOpen(null)}
          onIssued={() => setTimeout(() => window.location.reload(), 3000)}
        />
      )}
    </>
  );
}
