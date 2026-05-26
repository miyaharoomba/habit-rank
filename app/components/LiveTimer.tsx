'use client'

import { useEffect, useMemo, useState } from 'react'

type Props = {
  startedAt: string | null
}

function formatDuration(ms: number) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return { days, hours, minutes, seconds }
}

export default function LiveTimer({ startedAt }: Props) {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])

  const startedMs = useMemo(
    () => (startedAt ? Date.parse(startedAt) : null),
    [startedAt]
  )

  const diff = startedMs ? now - startedMs : 0
  const { days, hours, minutes, seconds } = formatDuration(diff)

  return (
    <div style={{ fontSize: 28, fontWeight: 700, margin: '12px 0' }}>
      {startedMs ? (
        <span>
          {days}日 {hours}時間 {minutes}分 {seconds}秒
        </span>
      ) : (
        <span>0日 0時間 0分 0秒</span>
      )}
    </div>
  )
}
