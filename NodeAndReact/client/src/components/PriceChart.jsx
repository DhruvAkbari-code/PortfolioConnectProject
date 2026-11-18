import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatINR, InlineSpinner } from './ui';

const RANGES = [
    { key: '1d', label: '1D', title: '1 day' },
    { key: '5d', label: '5D', title: '5 days' },
    { key: '1mo', label: '1M', title: '1 month' },
    { key: '3mo', label: '3M', title: '3 months' },
    { key: '6mo', label: '6M', title: '6 months' },
    { key: '1y', label: '1Y', title: '1 year' },
];

const MARGIN = { top: 16, right: 16, bottom: 30, left: 60 };

function formatAxisPrice(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
    if (Math.abs(n) >= 1000) return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
    return `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatChartDate(value, range, { axis = false } = {}) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    if (range === '1d') {
        return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    }
    if (range === '5d') {
        if (axis) {
            return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
        }
        return d.toLocaleString('en-IN', {
            day: '2-digit', month: 'short',
            hour: '2-digit', minute: '2-digit',
        });
    }
    if (axis) {
        return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
    }
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function pickAxisIndexes(length, count) {
    if (length <= count) return Array.from({ length }, (_, i) => i);
    const indexes = [];
    for (let i = 0; i < count; i += 1) {
        indexes.push(Math.round((i / (count - 1)) * (length - 1)));
    }
    return [...new Set(indexes)];
}

export default function PriceChart({
    data = [],
    loading = false,
    error = '',
    range = '1mo',
    onRangeChange,
    onRetry,
}) {
    const wrapRef = useRef(null);
    const gradientId = `chart-fill-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const [size, setSize] = useState({ width: 760, height: 300 });
    const [hoverIndex, setHoverIndex] = useState(null);

    useEffect(() => {
        const node = wrapRef.current;
        if (!node) return undefined;
        const measure = () => {
            const width = Math.round(node.clientWidth);
            if (width > 0) {
                setSize({ width, height: Math.max(220, Math.min(340, Math.round(width * 0.4))) });
            }
        };
        measure();
        if (typeof ResizeObserver === 'undefined') return undefined;
        const observer = new ResizeObserver(measure);
        observer.observe(node);
        return () => observer.disconnect();
    }, [loading, error]);

    const points = useMemo(() => (
        (data ?? [])
            .map((point) => {
                const value = Number(point.close);
                const time = point.time ?? point.date;
                return {
                    ...point,
                    value,
                    time,
                    timestamp: new Date(time).getTime(),
                    volume: Number(point.volume),
                };
            })
            .filter((point) => Number.isFinite(point.value) && Number.isFinite(point.timestamp))
    ), [data]);

    useEffect(() => { setHoverIndex(null); }, [range, points.length]);

    const geometry = useMemo(() => {
        if (points.length === 0) return null;

        const values = points.map((point) => point.value);
        const rawMin = Math.min(...values);
        const rawMax = Math.max(...values);
        const spread = rawMax - rawMin;
        const padding = spread > 0 ? spread * 0.1 : Math.max(Math.abs(rawMax) * 0.01, 1);
        const min = rawMin - padding;
        const max = rawMax + padding;
        const plotWidth = Math.max(1, size.width - MARGIN.left - MARGIN.right);
        const plotHeight = Math.max(1, size.height - MARGIN.top - MARGIN.bottom);
        const xAt = (index) => MARGIN.left + (points.length === 1 ? plotWidth / 2 : (index / (points.length - 1)) * plotWidth);
        const yAt = (value) => MARGIN.top + ((max - value) / (max - min)) * plotHeight;

        const coords = points.map((point, index) => ({
            x: xAt(index),
            y: yAt(point.value),
        }));
        const linePath = coords.map((c, index) => `${index === 0 ? 'M' : 'L'}${c.x.toFixed(2)},${c.y.toFixed(2)}`).join(' ');
        const areaPath = `${linePath} L${coords[coords.length - 1].x.toFixed(2)},${(size.height - MARGIN.bottom).toFixed(2)} L${coords[0].x.toFixed(2)},${(size.height - MARGIN.bottom).toFixed(2)} Z`;

        const gridCount = 4;
        const grid = Array.from({ length: gridCount + 1 }, (_, index) => {
            const value = max - (index / gridCount) * (max - min);
            return { value, y: yAt(value) };
        });

        const labelCount = size.width < 520 ? 3 : size.width < 760 ? 4 : 5;
        const xLabels = pickAxisIndexes(points.length, labelCount).map((index) => ({
            index,
            x: coords[index].x,
            anchor: index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle',
        }));

        return {
            coords, linePath, areaPath, grid, xLabels,
            rawMin, rawMax,
        };
    }, [points, size]);

    const first = points[0];
    const last = points[points.length - 1];
    const periodChange = first && last ? last.value - first.value : 0;
    const periodPct = first?.value ? (periodChange / first.value) * 100 : 0;
    const positive = periodChange >= 0;
    const lineColor = positive ? 'var(--green)' : 'var(--red)';
    const activeRange = RANGES.find((item) => item.key === range) ?? RANGES[2];
    const fresh = Boolean(geometry) && !loading && !error;

    const hovered = hoverIndex != null && geometry ? points[hoverIndex] : null;
    const hoveredCoord = hoverIndex != null && geometry ? geometry.coords[hoverIndex] : null;
    const hoverChange = hovered && first ? hovered.value - first.value : 0;
    const hoverPct = hovered && first?.value ? (hoverChange / first.value) * 100 : 0;

    function handlePointerMove(event) {
        if (!geometry || !wrapRef.current) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const hoverX = event.clientX - rect.left;
        const plotWidth = Math.max(1, size.width - MARGIN.left - MARGIN.right);
        const ratio = Math.max(0, Math.min(1, (hoverX - MARGIN.left) / plotWidth));
        setHoverIndex(Math.round(ratio * (points.length - 1)));
    }

    return (
        <div className="card chart-card">
            <div className="chart-header">
                <div>
                    <div className="card-title">
                        <i className="fas fa-chart-area" style={{ marginRight: 8, color: 'var(--accent)' }} />
                        Price History
                    </div>
                    <div className="chart-subtitle">
                        {activeRange.title}
                        {fresh && ` · ${points.length} data points`}
                    </div>
                </div>
                <div className="chart-ranges" role="group" aria-label="Chart time range">
                    {RANGES.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            className={`chart-range-btn${item.key === range ? ' active' : ''}`}
                            onClick={() => onRangeChange?.(item.key)}
                            aria-pressed={item.key === range}
                        >
                            {item.label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="chart-placeholder">
                    <InlineSpinner />
                    <span>Loading price history…</span>
                </div>
            ) : error ? (
                <div className="chart-placeholder chart-placeholder-error">
                    <i className="fas fa-triangle-exclamation" />
                    <span>{error}</span>
                    {onRetry && (
                        <button type="button" className="btn btn-ghost btn-sm" onClick={onRetry}>
                            <i className="fas fa-rotate-right" /> Retry
                        </button>
                    )}
                </div>
            ) : !geometry || points.length < 2 ? (
                <div className="chart-placeholder">
                    <i className="fas fa-chart-line" />
                    <span>No price history is available for this range.</span>
                </div>
            ) : (
                <>
                    <div className="chart-summary">
                        <span>
                            Period
                            <strong className={positive ? 'text-up' : 'text-down'}>
                                {' '}{positive ? '+' : '−'}{formatINR(Math.abs(periodChange))} ({Math.abs(periodPct).toFixed(2)}%)
                            </strong>
                        </span>
                        <span>Period high <strong>{formatINR(geometry.rawMax)}</strong></span>
                        <span>Period low <strong>{formatINR(geometry.rawMin)}</strong></span>
                    </div>

                    <div className="chart-body" ref={wrapRef}>
                        <svg
                            className="chart-svg"
                            width={size.width}
                            height={size.height}
                            viewBox={`0 0 ${size.width} ${size.height}`}
                            role="img"
                            aria-label={`${activeRange.title} price chart with ${points.length} data points`}
                            onPointerMove={handlePointerMove}
                            onPointerLeave={() => setHoverIndex(null)}
                        >
                            <defs>
                                <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={lineColor} stopOpacity="0.28" />
                                    <stop offset="100%" stopColor={lineColor} stopOpacity="0.02" />
                                </linearGradient>
                            </defs>

                            {geometry.grid.map((line) => (
                                <g key={line.y}>
                                    <line
                                        className="chart-grid-line"
                                        x1={MARGIN.left}
                                        x2={size.width - MARGIN.right}
                                        y1={line.y}
                                        y2={line.y}
                                    />
                                    <text
                                        className="chart-axis-label"
                                        x={MARGIN.left - 10}
                                        y={line.y + 4}
                                        textAnchor="end"
                                    >
                                        {formatAxisPrice(line.value)}
                                    </text>
                                </g>
                            ))}

                            <path d={geometry.areaPath} fill={`url(#${gradientId})`} />
                            <path d={geometry.linePath} className="chart-line" stroke={lineColor} />

                            {geometry.xLabels.map((label) => (
                                <text
                                    key={label.index}
                                    className="chart-axis-label"
                                    x={label.x}
                                    y={size.height - 8}
                                    textAnchor={label.anchor}
                                >
                                    {formatChartDate(points[label.index].time, range, { axis: true })}
                                </text>
                            ))}

                            {hoveredCoord && (
                                <g>
                                    <line
                                        className="chart-hover-line"
                                        x1={hoveredCoord.x}
                                        x2={hoveredCoord.x}
                                        y1={MARGIN.top}
                                        y2={size.height - MARGIN.bottom}
                                    />
                                    <circle
                                        cx={hoveredCoord.x}
                                        cy={hoveredCoord.y}
                                        r="5"
                                        fill={lineColor}
                                        stroke="var(--bg-card)"
                                        strokeWidth="2"
                                    />
                                </g>
                            )}
                        </svg>

                        {hovered && hoveredCoord && (
                            <div
                                className="chart-tooltip"
                                style={{
                                    left: Math.max(78, Math.min(size.width - 78, hoveredCoord.x)),
                                    top: Math.max(28, hoveredCoord.y),
                                }}
                            >
                                <div className="chart-tooltip-date">
                                    {formatChartDate(hovered.time, range)}
                                </div>
                                <div className="chart-tooltip-price">{formatINR(hovered.value)}</div>
                                <div className={hoverChange >= 0 ? 'text-up' : 'text-down'}>
                                    {hoverChange >= 0 ? '▲' : '▼'} {formatINR(Math.abs(hoverChange))} ({Math.abs(hoverPct).toFixed(2)}%)
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="chart-footnote">
                        Historical closes from Yahoo Finance · informational only, not trading advice
                    </div>
                </>
            )}
        </div>
    );
}
