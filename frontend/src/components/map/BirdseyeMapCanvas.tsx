import React, { useState, useRef, useMemo, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, User, Sparkles } from 'lucide-react';
import type { PersonRead, PersonSummary } from '../../types/api';

export type MapPerson = PersonRead | PersonSummary;

interface BirdseyeMapCanvasProps {
  people: MapPerson[];
  focusPersonId?: string | null;
  onSelectPerson?: (personId: string) => void;
}

interface PositionedNode {
  person: MapPerson;
  x: number;
  y: number;
  width: number;
  height: number;
  tier: number;
}

export const BirdseyeMapCanvas: React.FC<BirdseyeMapCanvasProps> = ({
  people,
  focusPersonId,
  onSelectPerson,
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Parse approximate birth year from string (e.g. "1942", "circa 1940", "12 Apr 1968")
  const parseYear = (dateStr?: string | null): number | null => {
    if (!dateStr) return null;
    const match = dateStr.match(/\b(1[6-9][0-9]{2}|20[0-2][0-9])\b/);
    return match ? parseInt(match[1], 10) : null;
  };

  // Node dimensions
  const NODE_WIDTH = 200;
  const NODE_HEIGHT = 90;
  const HORIZONTAL_GAP = 50;
  const VERTICAL_GAP = 120;

  // Calculate layout: organize people into generational tiers based on birth year
  const { nodes, connections, bounds } = useMemo(() => {
    if (people.length === 0) {
      return {
        nodes: [] as PositionedNode[],
        connections: [] as { from: PositionedNode; to: PositionedNode }[],
        bounds: { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600 },
      };
    }

    // Sort people by parsed birth year (earliest first), unknown birth years last
    const sorted = [...people].sort((a, b) => {
      const yearA = parseYear(a.birth_date);
      const yearB = parseYear(b.birth_date);
      if (yearA !== null && yearB !== null) return yearA - yearB;
      if (yearA !== null) return -1;
      if (yearB !== null) return 1;
      return a.first_name.localeCompare(b.first_name);
    });

    // Group into 4 generational tiers or rows
    const tiers: MapPerson[][] = [[], [], [], []];
    
    // Determine min and max years
    const years = sorted.map((p) => parseYear(p.birth_date)).filter((y): y is number => y !== null);
    if (years.length >= 2) {
      const minYear = years[0];
      const maxYear = years[years.length - 1];
      const span = Math.max(1, maxYear - minYear);
      const tierStep = span / 4;

      sorted.forEach((p) => {
        const y = parseYear(p.birth_date);
        if (y === null) {
          tiers[2].push(p); // Default unknown to middle tier
        } else {
          const tierIdx = Math.min(3, Math.floor((y - minYear) / Math.max(1, tierStep)));
          tiers[tierIdx].push(p);
        }
      });
    } else {
      // If few/no dates, split evenly across tiers (max 4 per tier)
      const perTier = Math.max(1, Math.ceil(sorted.length / 3));
      sorted.forEach((p, idx) => {
        const tierIdx = Math.min(3, Math.floor(idx / perTier));
        tiers[tierIdx].push(p);
      });
    }

    // Filter out empty tiers while keeping index
    const activeTiers = tiers.map((tierPeople, tierIdx) => ({
      tierIdx,
      people: tierPeople,
    })).filter((t) => t.people.length > 0);

    const calculatedNodes: PositionedNode[] = [];
    const maxNodesInTier = Math.max(...activeTiers.map((t) => t.people.length), 1);
    const canvasCenterX = (maxNodesInTier * (NODE_WIDTH + HORIZONTAL_GAP)) / 2 + 100;

    activeTiers.forEach(({ tierIdx }, visualRowIdx) => {
      const tierPeople = tiers[tierIdx];
      const rowWidth = tierPeople.length * NODE_WIDTH + (tierPeople.length - 1) * HORIZONTAL_GAP;
      const startX = canvasCenterX - rowWidth / 2;
      const y = 80 + visualRowIdx * (NODE_HEIGHT + VERTICAL_GAP);

      tierPeople.forEach((p, colIdx) => {
        const x = startX + colIdx * (NODE_WIDTH + HORIZONTAL_GAP);
        calculatedNodes.push({
          person: p,
          x,
          y,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
          tier: tierIdx,
        });
      });
    });

    // Create visual connector lines between successive tiers
    const conns: { from: PositionedNode; to: PositionedNode }[] = [];
    for (let i = 0; i < calculatedNodes.length; i++) {
      for (let j = i + 1; j < calculatedNodes.length; j++) {
        const nodeA = calculatedNodes[i];
        const nodeB = calculatedNodes[j];
        if (nodeB.y > nodeA.y && nodeB.y - nodeA.y <= NODE_HEIGHT + VERTICAL_GAP + 10) {
          if (Math.abs(nodeA.x - nodeB.x) < NODE_WIDTH * 1.5) {
            conns.push({ from: nodeA, to: nodeB });
          }
        }
      }
    }

    // Calculate bounding box
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    calculatedNodes.forEach((n) => {
      if (n.x < minX) minX = n.x;
      if (n.y < minY) minY = n.y;
      if (n.x + n.width > maxX) maxX = n.x + n.width;
      if (n.y + n.height > maxY) maxY = n.y + n.height;
    });

    if (!isFinite(minX)) {
      minX = 0;
      minY = 0;
      maxX = 800;
      maxY = 600;
    }

    return {
      nodes: calculatedNodes,
      connections: conns,
      bounds: {
        minX: minX - 100,
        minY: minY - 50,
        maxX: maxX + 100,
        maxY: maxY + 100,
        width: Math.max(800, maxX - minX + 200),
        height: Math.max(600, maxY - minY + 150),
      },
    };
  }, [people]);

  // Center on focus person if specified
  useEffect(() => {
    if (focusPersonId && nodes.length > 0) {
      const target = nodes.find((n) => n.person.id === focusPersonId);
      if (target) {
        setPan({
          x: 400 - (target.x + target.width / 2),
          y: 250 - (target.y + target.height / 2),
        });
        setZoom(1);
      }
    }
  }, [focusPersonId, nodes]);

  // Zoom controls
  const handleZoomIn = () => setZoom((prev) => Math.min(prev * 1.25, 3.0));
  const handleZoomOut = () => setZoom((prev) => Math.max(prev / 1.25, 0.4));
  const handleReset = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // Drag pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  return (
    <div
      role="region"
      aria-label="Family Tree Overview Map"
      className="relative w-full h-[650px] bg-slate-100 rounded-3xl border-2 border-slate-300 overflow-hidden select-none flex flex-col shadow-inner"
    >
      {/* Top Controls Bar */}
      <div className="absolute top-4 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        <div className="bg-white/90 backdrop-blur-md px-4 py-2 rounded-2xl border-2 border-slate-200 shadow-md pointer-events-auto flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-amber-600" />
          <span className="font-bold text-slate-800 text-sm">
            Overview Map ({people.length} {people.length === 1 ? 'member' : 'members'})
          </span>
          <span className="text-xs text-slate-500 hidden sm:inline">| Drag to pan, scroll/click to zoom</span>
        </div>

        <div className="flex items-center gap-2 bg-white/90 backdrop-blur-md p-1.5 rounded-2xl border-2 border-slate-200 shadow-md pointer-events-auto">
          <button
            type="button"
            onClick={handleZoomIn}
            aria-label="Zoom In"
            className="p-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer"
          >
            <ZoomIn className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={handleZoomOut}
            aria-label="Zoom Out"
            className="p-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer"
          >
            <ZoomOut className="w-5 h-5" />
          </button>
          <div className="w-[1px] h-6 bg-slate-200 mx-0.5" />
          <button
            type="button"
            onClick={handleReset}
            aria-label="Reset View"
            className="p-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden md:inline">Reset</span>
          </button>
        </div>
      </div>

      {/* Empty State */}
      {people.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 border border-amber-300 flex items-center justify-center text-amber-700 mb-3">
            <User className="w-8 h-8" />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-1">No Family Records Yet</h3>
          <p className="text-sm text-slate-600 max-w-sm">
            Add family members in the Focus View to see your complete multi-generation overview map here.
          </p>
        </div>
      ) : (
        /* SVG Interactive Canvas */
        <svg
          ref={svgRef}
          aria-label="Family tree pedigree chart"
          className="w-full h-full cursor-grab active:cursor-grabbing"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* Background Grid Pattern */}
            <defs>
              <pattern id="dot-grid" x="0" y="0" width="30" height="30" patternUnits="userSpaceOnUse">
                <circle cx="2" cy="2" r="1.5" className="fill-slate-300" />
              </pattern>
            </defs>
            <rect
              x={bounds.minX - 500}
              y={bounds.minY - 500}
              width={bounds.width + 1000}
              height={bounds.height + 1000}
              fill="url(#dot-grid)"
            />

            {/* Connecting Lines */}
            {connections.map((conn, idx) => {
              const startX = conn.from.x + conn.from.width / 2;
              const startY = conn.from.y + conn.from.height;
              const endX = conn.to.x + conn.to.width / 2;
              const endY = conn.to.y;
              const midY = (startY + endY) / 2;

              return (
                <path
                  key={`conn-${idx}`}
                  d={`M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`}
                  fill="none"
                  stroke="#cbd5e1"
                  strokeWidth="2.5"
                  strokeDasharray="4 4"
                />
              );
            })}

            {/* Person Nodes */}
            {nodes.map((node) => {
              const isFocus = node.person.id === focusPersonId;
              const fullName = `${node.person.first_name} ${node.person.last_name}`.trim();
              
              let datesLabel = '';
              if (node.person.birth_date && node.person.death_date) {
                datesLabel = `${node.person.birth_date} – ${node.person.death_date}`;
              } else if (node.person.birth_date) {
                datesLabel = `b. ${node.person.birth_date}`;
              } else if (node.person.death_date) {
                datesLabel = `d. ${node.person.death_date}`;
              } else {
                datesLabel = node.person.is_living ? 'Living' : '';
              }

              return (
                <g
                  key={node.person.id}
                  transform={`translate(${node.x}, ${node.y})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelectPerson?.(node.person.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onSelectPerson?.(node.person.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${fullName}${datesLabel ? `, ${datesLabel}` : ''}`}
                  className="cursor-pointer group focus:outline-none"
                >
                  {/* Node Background Rectangle */}
                  <rect
                    width={node.width}
                    height={node.height}
                    rx="16"
                    ry="16"
                    className={`transition-all duration-200 ${
                      isFocus
                        ? 'fill-amber-50 stroke-amber-500 stroke-[3]'
                        : 'fill-white stroke-slate-300 stroke-2 group-hover:stroke-amber-400 group-hover:shadow-md'
                    }`}
                  />

                  {/* Focus Ring Indicator */}
                  {isFocus && (
                    <rect
                      x="-4"
                      y="-4"
                      width={node.width + 8}
                      height={node.height + 8}
                      rx="20"
                      ry="20"
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="2"
                      strokeDasharray="4 3"
                      className="animate-pulse"
                    />
                  )}

                  {/* Avatar Circle */}
                  <circle
                    cx="32"
                    cy="45"
                    r="18"
                    className={isFocus ? 'fill-amber-200' : 'fill-slate-100 group-hover:fill-amber-100'}
                  />
                  <text
                    x="32"
                    y="51"
                    textAnchor="middle"
                    className={`text-xs font-black select-none ${
                      isFocus ? 'fill-amber-900' : 'fill-slate-600'
                    }`}
                  >
                    {node.person.first_name[0]}
                    {node.person.last_name[0]}
                  </text>

                  {/* Name Text */}
                  <text
                    x="60"
                    y="38"
                    className={`text-sm font-extrabold select-none ${
                      isFocus ? 'fill-slate-950 font-black' : 'fill-slate-900'
                    }`}
                  >
                    {fullName.length > 15 ? `${fullName.slice(0, 14)}…` : fullName}
                  </text>

                  {/* Life Dates Text */}
                  <text
                    x="60"
                    y="58"
                    className={`text-xs select-none font-bold ${
                      isFocus ? 'fill-amber-800' : 'fill-slate-500'
                    }`}
                  >
                    {datesLabel || 'Family Member'}
                  </text>

                  {/* Focus indicator badge */}
                  {isFocus && (
                    <g transform={`translate(${node.width - 24}, 8)`}>
                      <circle cx="8" cy="8" r="6" fill="#f59e0b" />
                    </g>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      )}
    </div>
  );
};
