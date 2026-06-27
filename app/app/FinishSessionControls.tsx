"use client";

import { useCallback, useState } from "react";
import FinishSessionButtons from "./FinishSessionButtons";
import SessionCameraCapture from "./SessionCameraCapture";

export default function FinishSessionControls({ sessionId }: { sessionId: string }) {
  const [photoBusy, setPhotoBusy] = useState(false);
  const handleBusyChange = useCallback((busy: boolean) => setPhotoBusy(busy), []);

  return (
    <div className="space-y-3">
      <SessionCameraCapture sessionId={sessionId} onBusyChange={handleBusyChange} />
      <FinishSessionButtons disabled={photoBusy} />
    </div>
  );
}
