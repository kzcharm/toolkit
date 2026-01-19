import { formatTime, type Record } from './map-overlay-utils'

interface RecordRowProps {
  wr: Record | null | undefined
  pb: Record | null | undefined
  label: 'TP' | 'PRO' | 'NUB'
}

export default function RecordRow({ wr, pb, label }: RecordRowProps) {
  const headerColorClass =
    label === 'PRO' ? 'text-[#1e90ff]' : 'text-orange-500'

  return (
    <tr className="pl-2.5">
      <td>
        <span className={`${headerColorClass} text-[22px] font-light ${label === 'TP' ? 'ml-[19px]' : label === 'PRO' ? 'ml-[1px]' : ''}`}>
          {label} |
        </span>

        {wr === undefined ? (
          <img
            className="h-5 ml-1.5 align-bottom"
            src="/map/assets/loading.gif"
            alt="Loading"
            onError={(e) => {
              // Fallback to CSS spinner if image fails to load
              const target = e.currentTarget
              target.style.display = 'none'
              const spinner = document.createElement('div')
              spinner.className = 'inline-block h-5 w-5 ml-1.5 align-bottom border-2 border-white border-t-transparent rounded-full animate-spin'
              target.parentElement?.appendChild(spinner)
            }}
          />
        ) : wr ? (
          <div className="inline text-white text-[22px] font-light pl-[5px]">
            <span>{formatTime(wr.time)} by</span>
            <span className="max-w-[100px] inline-block whitespace-nowrap overflow-hidden text-ellipsis align-bottom">
              {wr.player_name}
            </span>

            {pb === undefined ? (
              <img
                className="h-5 ml-1.5 align-bottom"
                src="/map/assets/loading.gif"
                alt="Loading"
                onError={(e) => {
                  const target = e.currentTarget
                  target.style.display = 'none'
                  const spinner = document.createElement('div')
                  spinner.className = 'inline-block h-5 w-5 ml-1.5 align-bottom border-2 border-white border-t-transparent rounded-full animate-spin'
                  target.parentElement?.appendChild(spinner)
                }}
              />
            ) : pb ? (
              <>
                {pb.time === wr.time ? (
                  <span className="text-[#adff2f]"> (WR by me)</span>
                ) : (
                  <span className="text-[#ff7f7f]">
                    {' '}
                    (+{formatTime(pb.time - wr.time)})
                  </span>
                )}
              </>
            ) : null}
          </div>
        ) : null}
      </td>
    </tr>
  )
}
