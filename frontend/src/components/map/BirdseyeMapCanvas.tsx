import React, { useState, useRef, useMemo, useEffect } from 'react';
import { ZoomIn, ZoomOut, RotateCcw, User, Sparkles, Pencil, Eye, X } from 'lucide-react';
import type { PersonRead, PersonSummary, TreeEdge } from '../../types/api';

export type MapPerson = PersonRead | PersonSummary;

const EMPTY_EDGES: TreeEdge[] = [];

interface BirdseyeMapCanvasProps {
  people: MapPerson[];
  edges?: TreeEdge[];
  focusPersonId?: string | null;
  workspaceId?: string;
  serverPositions?: Record<string, { x: number; y: number }>;
  onSelectPerson?: (personId: string) => void;
  onEditPerson?: (person: MapPerson) => void;
  onSavePositions?: (positions: Record<string, { x: number; y: number }>) => void;
  onResetPositions?: () => void;
  canEdit?: boolean;
}

interface PositionedNode {
  person: MapPerson;
  x: number;
  y: number;
  width: number;
  height: number;
  tier: number;
}

interface RenderedEdge {
  id: string;
  type: 'partner' | 'parent_child';
  role?: 'marriage' | 'stem' | 'bus' | 'ingress';
  pathData: string;
  sourceNode: PositionedNode;
  targetNode: PositionedNode;
  midX?: number;
  midY?: number;
}

export const BirdseyeMapCanvas: React.FC<BirdseyeMapCanvasProps> = ({
  people,
  edges = EMPTY_EDGES,
  focusPersonId,
  workspaceId: _workspaceId,
  serverPositions,
  onSelectPerson,
  onEditPerson,
  onSavePositions,
  onResetPositions,
  canEdit = true,
}) => {
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const centeredPersonIdRef = useRef<string | null>(null);

  const [customPositions, setCustomPositions] = useState<Record<string, { x: number; y: number }>>(
    serverPositions || {}
  );
  const latestCustomPositionsRef = useRef<Record<string, { x: number; y: number }>>(
    serverPositions || {}
  );
  const [_draggedNodeId, setDraggedNodeId] = useState<string | null>(null);
  const justDraggedRef = useRef<boolean>(false);
  const draggedNodeRef = useRef<{
    id: string;
    startPointerX: number;
    startPointerY: number;
    startNodeX: number;
    startNodeY: number;
    hasMoved: boolean;
  } | null>(null);

  // Multi-touch gestures & single-finger guidance toast state
  const multiTouchRef = useRef<{
    midpoint: { x: number; y: number };
    distance: number;
    startZoom: number;
    startPan: { x: number; y: number };
  } | null>(null);
  const singleTouchRef = useRef<{ x: number; y: number; triggered: boolean } | null>(null);
  const [showTouchToast, setShowTouchToast] = useState(false);
  const touchToastTimerRef = useRef<NodeJS.Timeout | number | null>(null);

  const triggerTouchGuidanceToast = () => {
    setShowTouchToast(true);
    if (touchToastTimerRef.current) {
      clearTimeout(touchToastTimerRef.current);
    }
    touchToastTimerRef.current = setTimeout(() => {
      setShowTouchToast(false);
      touchToastTimerRef.current = null;
    }, 1500);
  };

  useEffect(() => {
    return () => {
      if (touchToastTimerRef.current) {
        clearTimeout(touchToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    setCustomPositions(serverPositions || {});
    latestCustomPositionsRef.current = serverPositions || {};
  }, [serverPositions]);

  // Parse approximate birth year from string (e.g. "1942", "circa 1940", "12 Apr 1968")
  const parseYear = (dateStr?: string | null): number | null => {
    if (!dateStr) return null;
    const match = dateStr.match(/\b(1[6-9][0-9]{2}|20[0-2][0-9])\b/);
    return match ? parseInt(match[1], 10) : null;
  };

  // Node dimensions & layout constants
  const NODE_WIDTH = 210;
  const NODE_HEIGHT = 90;
  const COUPLE_GAP = 24;
  const UNIT_GAP = 70;
  const VERTICAL_GAP = 140;

  // Helper to construct vertical SVG path with jump arc bridges over crossing horizontal lines
  const buildVerticalPath = (
    x: number,
    y1: number,
    y2: number,
    horizontalSegments: Array<{ id: string; xMin: number; xMax: number; y: number }>
  ): string => {
    const yMin = Math.min(y1, y2);
    const yMax = Math.max(y1, y2);

    const crossingYs: number[] = [];
    horizontalSegments.forEach((h) => {
      // Crosses when vertical line x falls within horizontal segment (with 4px margin)
      // and horizontal segment y falls within vertical line span (with 4px margin)
      if (x >= h.xMin + 4 && x <= h.xMax - 4 && h.y >= yMin + 4 && h.y <= yMax - 4) {
        crossingYs.push(h.y);
      }
    });

    const uniqueCrossings = Array.from(new Set(crossingYs)).sort((a, b) => a - b);

    if (uniqueCrossings.length === 0) {
      return `M ${x} ${y1} L ${x} ${y2}`;
    }

    if (y1 <= y2) {
      let path = `M ${x} ${y1}`;
      let curY = y1;
      for (const yCross of uniqueCrossings) {
        const arcStartY = yCross - 6;
        const arcEndY = yCross + 6;
        if (arcStartY > curY) {
          path += ` L ${x} ${arcStartY}`;
        }
        path += ` A 6 6 0 0 0 ${x} ${arcEndY}`;
        curY = arcEndY;
      }
      if (curY < y2) {
        path += ` L ${x} ${y2}`;
      }
      return path;
    } else {
      uniqueCrossings.reverse();
      let path = `M ${x} ${y1}`;
      let curY = y1;
      for (const yCross of uniqueCrossings) {
        const arcStartY = yCross + 6;
        const arcEndY = yCross - 6;
        if (arcStartY < curY) {
          path += ` L ${x} ${arcStartY}`;
        }
        path += ` A 6 6 0 0 0 ${x} ${arcEndY}`;
        curY = arcEndY;
      }
      if (curY > y2) {
        path += ` L ${x} ${y2}`;
      }
      return path;
    }
  };

  // Calculate layout: topological generational tiers + partner alignment
  const { nodes, connections, bounds } = useMemo(() => {
    if (people.length === 0) {
      return {
        nodes: [] as PositionedNode[],
        connections: [] as RenderedEdge[],
        bounds: { minX: 0, minY: 0, maxX: 800, maxY: 600, width: 800, height: 600 },
      };
    }

    // 1. Build adjacency maps
    const childToParents = new Map<string, string[]>();
    const parentToChildren = new Map<string, string[]>();
    const partnerMap = new Map<string, Set<string>>();

    people.forEach((p) => {
      childToParents.set(p.id, []);
      parentToChildren.set(p.id, []);
      partnerMap.set(p.id, new Set());
    });

    edges.forEach((e) => {
      if (e.edge_type === 'partner') {
        partnerMap.get(e.source_id)?.add(e.target_id);
        partnerMap.get(e.target_id)?.add(e.source_id);
      } else if (e.edge_type === 'parent_child') {
        childToParents.get(e.target_id)?.push(e.source_id);
        parentToChildren.get(e.source_id)?.push(e.target_id);
      }
    });

    // 2. Compute generational depths using DAG relaxation
    const depths = new Map<string, number>();
    people.forEach((p) => depths.set(p.id, 0));

    // Multiple passes to settle depths across parent-child links and partner pairs
    for (let pass = 0; pass < people.length + 5; pass++) {
      let changed = false;

      // Rule A: Parent-child pushes child to at least parent.depth + 1
      edges.forEach((e) => {
        if (e.edge_type === 'parent_child') {
          const parentDepth = depths.get(e.source_id) ?? 0;
          const currentChildDepth = depths.get(e.target_id) ?? 0;
          if (currentChildDepth < parentDepth + 1) {
            depths.set(e.target_id, parentDepth + 1);
            changed = true;
          }
        }
      });

      // Rule B: Partners share the same generational depth (max of both)
      edges.forEach((e) => {
        if (e.edge_type === 'partner') {
          const depth1 = depths.get(e.source_id) ?? 0;
          const depth2 = depths.get(e.target_id) ?? 0;
          const maxDepth = Math.max(depth1, depth2);
          if (depth1 !== maxDepth) {
            depths.set(e.source_id, maxDepth);
            changed = true;
          }
          if (depth2 !== maxDepth) {
            depths.set(e.target_id, maxDepth);
            changed = true;
          }
        }
      });

      if (!changed) break;
    }

    // 3. Fallback for disconnected nodes without parents/children: group by birth years
    const hasEdges = edges.length > 0;
    if (!hasEdges) {
      const sorted = [...people].sort((a, b) => {
        const yA = parseYear(a.birth_date);
        const yB = parseYear(b.birth_date);
        if (yA !== null && yB !== null) return yA - yB;
        if (yA !== null) return -1;
        if (yB !== null) return 1;
        return a.first_name.localeCompare(b.first_name);
      });
      const years = sorted.map((p) => parseYear(p.birth_date)).filter((y): y is number => y !== null);
      if (years.length >= 2) {
        const minYear = years[0];
        const maxYear = years[years.length - 1];
        const span = Math.max(1, maxYear - minYear);
        const tierStep = span / 3;
        sorted.forEach((p) => {
          const y = parseYear(p.birth_date);
          const tierIdx = y === null ? 1 : Math.min(2, Math.floor((y - minYear) / Math.max(1, tierStep)));
          depths.set(p.id, tierIdx);
        });
      }
    }

    // 4. Group people into tiers by depth
    const tierMap = new Map<number, MapPerson[]>();
    people.forEach((p) => {
      const d = depths.get(p.id) ?? 0;
      if (!tierMap.has(d)) tierMap.set(d, []);
      tierMap.get(d)!.push(p);
    });

    const sortedTiers = Array.from(tierMap.keys()).sort((a, b) => a - b);

    // 5. Partition each tier into Family Units (CoupleUnit or SingleUnit)
    interface FamilyUnit {
      id: string;
      type: 'couple' | 'single';
      people: MapPerson[];
      tier: number;
      width: number;
      centerX: number;
    }

    const tierUnits = new Map<number, FamilyUnit[]>();

    sortedTiers.forEach((tierLevel) => {
      const tierPeople = tierMap.get(tierLevel) || [];
      const visited = new Set<string>();
      const units: FamilyUnit[] = [];

      // Sort people deterministically by birth year / first name
      const sortedPeople = [...tierPeople].sort((a, b) => {
        const yA = parseYear(a.birth_date);
        const yB = parseYear(b.birth_date);
        if (yA !== null && yB !== null && yA !== yB) return yA - yB;
        if (yA !== null) return -1;
        if (yB !== null) return 1;
        return a.first_name.localeCompare(b.first_name);
      });

      sortedPeople.forEach((p) => {
        if (visited.has(p.id)) return;
        visited.add(p.id);

        const partners = partnerMap.get(p.id);
        let partnerObj: MapPerson | undefined;
        if (partners) {
          for (const partnerId of partners) {
            if (!visited.has(partnerId)) {
              const found = tierPeople.find((tp) => tp.id === partnerId);
              if (found) {
                partnerObj = found;
                visited.add(partnerId);
                break;
              }
            }
          }
        }

        if (partnerObj) {
          units.push({
            id: `couple-${p.id}-${partnerObj.id}`,
            type: 'couple',
            people: [p, partnerObj],
            tier: tierLevel,
            width: NODE_WIDTH * 2 + COUPLE_GAP,
            centerX: 0,
          });
        } else {
          units.push({
            id: `single-${p.id}`,
            type: 'single',
            people: [p],
            tier: tierLevel,
            width: NODE_WIDTH,
            centerX: 0,
          });
        }
      });

      tierUnits.set(tierLevel, units);
    });

    const getTierWidth = (units: FamilyUnit[]): number => {
      if (units.length === 0) return 0;
      const totalUnitWidth = units.reduce((sum, u) => sum + u.width, 0);
      return totalUnitWidth + (units.length - 1) * UNIT_GAP;
    };

    const maxTierWidth = Math.max(
      ...sortedTiers.map((lvl) => getTierWidth(tierUnits.get(lvl) || [])),
      1
    );
    const canvasCenterX = maxTierWidth / 2 + 100;

    const nodeMap = new Map<string, PositionedNode>();

    const assignTierCoordinates = (
      units: FamilyUnit[],
      tierLevel: number,
      visualRowIdx: number
    ) => {
      const tierWidth = getTierWidth(units);
      let currentX = canvasCenterX - tierWidth / 2;
      const y = 90 + visualRowIdx * (NODE_HEIGHT + VERTICAL_GAP);

      units.forEach((unit) => {
        unit.centerX = currentX + unit.width / 2;

        if (unit.type === 'single') {
          const p = unit.people[0];
          const calculatedX = currentX;
          const calculatedY = y;
          const posX = customPositions[p.id]?.x ?? calculatedX;
          const posY = customPositions[p.id]?.y ?? calculatedY;
          nodeMap.set(p.id, {
            person: p,
            x: posX,
            y: posY,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            tier: tierLevel,
          });
        } else if (unit.type === 'couple') {
          const [p1, p2] = unit.people;
          const calculatedX1 = currentX;
          const calculatedY1 = y;
          const calculatedX2 = currentX + NODE_WIDTH + COUPLE_GAP;
          const calculatedY2 = y;
          const posX1 = customPositions[p1.id]?.x ?? calculatedX1;
          const posY1 = customPositions[p1.id]?.y ?? calculatedY1;
          const posX2 = customPositions[p2.id]?.x ?? calculatedX2;
          const posY2 = customPositions[p2.id]?.y ?? calculatedY2;
          nodeMap.set(p1.id, {
            person: p1,
            x: posX1,
            y: posY1,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            tier: tierLevel,
          });
          nodeMap.set(p2.id, {
            person: p2,
            x: posX2,
            y: posY2,
            width: NODE_WIDTH,
            height: NODE_HEIGHT,
            tier: tierLevel,
          });
        }

        currentX += unit.width + UNIT_GAP;
      });
    };

    // Initial assignment (Pass 0)
    sortedTiers.forEach((tierLevel, visualRowIdx) => {
      const units = tierUnits.get(tierLevel) || [];
      assignTierCoordinates(units, tierLevel, visualRowIdx);
    });

    // Helper to calculate parent barycenter for a unit
    const computeParentBarycenter = (unit: FamilyUnit): { barycenter: number; hasParents: boolean; parentGroupKey: string } => {
      const parentIds = new Set<string>();
      unit.people.forEach((p) => {
        const parents = childToParents.get(p.id) || [];
        parents.forEach((pid) => parentIds.add(pid));
      });

      if (parentIds.size === 0) {
        return { barycenter: unit.centerX, hasParents: false, parentGroupKey: '' };
      }

      let sumX = 0;
      let count = 0;
      const sortedParentIds = Array.from(parentIds).sort();
      sortedParentIds.forEach((pid) => {
        const pNode = nodeMap.get(pid);
        if (pNode) {
          sumX += pNode.x + pNode.width / 2;
          count++;
        }
      });

      if (count === 0) {
        return { barycenter: unit.centerX, hasParents: false, parentGroupKey: '' };
      }

      return {
        barycenter: sumX / count,
        hasParents: true,
        parentGroupKey: sortedParentIds.join(','),
      };
    };

    // Helper to calculate child barycenter for a unit
    const computeChildBarycenter = (unit: FamilyUnit): { barycenter: number; hasChildren: boolean } => {
      const childIds = new Set<string>();
      unit.people.forEach((p) => {
        const children = parentToChildren.get(p.id) || [];
        children.forEach((cid) => childIds.add(cid));
      });

      if (childIds.size === 0) {
        return { barycenter: unit.centerX, hasChildren: false };
      }

      let sumX = 0;
      let count = 0;
      childIds.forEach((cid) => {
        const cNode = nodeMap.get(cid);
        if (cNode) {
          sumX += cNode.x + cNode.width / 2;
          count++;
        }
      });

      if (count === 0) {
        return { barycenter: unit.centerX, hasChildren: false };
      }

      return { barycenter: sumX / count, hasChildren: true };
    };

    // Multi-pass barycentric sweeps (top-down, bottom-up, top-down)
    const NUM_PASSES = 2;
    for (let pass = 0; pass < NUM_PASSES; pass++) {
      // Top-Down Pass: tier 1 to k
      for (let i = 1; i < sortedTiers.length; i++) {
        const tierLevel = sortedTiers[i];
        const units = tierUnits.get(tierLevel) || [];
        if (units.length <= 1) continue;

        const barycenters = new Map<string, { barycenter: number; hasParents: boolean; parentGroupKey: string }>();
        units.forEach((u) => {
          barycenters.set(u.id, computeParentBarycenter(u));
        });

        units.sort((a, b) => {
          const bA = barycenters.get(a.id)!;
          const bB = barycenters.get(b.id)!;

          if (Math.abs(bA.barycenter - bB.barycenter) > 0.001) {
            return bA.barycenter - bB.barycenter;
          }

          // Full siblings sharing identical parents
          if (bA.parentGroupKey && bB.parentGroupKey && bA.parentGroupKey === bB.parentGroupKey) {
            const yA = parseYear(a.people[0]?.birth_date);
            const yB = parseYear(b.people[0]?.birth_date);
            if (yA !== null && yB !== null && yA !== yB) return yA - yB;
            if (yA !== null) return -1;
            if (yB !== null) return 1;
            return a.id.localeCompare(b.id);
          }

          const yA = parseYear(a.people[0]?.birth_date);
          const yB = parseYear(b.people[0]?.birth_date);
          if (yA !== null && yB !== null && yA !== yB) return yA - yB;
          if (yA !== null) return -1;
          if (yB !== null) return 1;
          return a.id.localeCompare(b.id);
        });

        assignTierCoordinates(units, tierLevel, i);
      }

      // Bottom-Up Pass: tier k-1 down to 0
      for (let i = sortedTiers.length - 2; i >= 0; i--) {
        const tierLevel = sortedTiers[i];
        const units = tierUnits.get(tierLevel) || [];
        if (units.length <= 1) continue;

        const barycenters = new Map<string, { barycenter: number; hasChildren: boolean }>();
        units.forEach((u) => {
          barycenters.set(u.id, computeChildBarycenter(u));
        });

        units.sort((a, b) => {
          const bA = barycenters.get(a.id)!;
          const bB = barycenters.get(b.id)!;

          if (Math.abs(bA.barycenter - bB.barycenter) > 0.001) {
            return bA.barycenter - bB.barycenter;
          }

          const yA = parseYear(a.people[0]?.birth_date);
          const yB = parseYear(b.people[0]?.birth_date);
          if (yA !== null && yB !== null && yA !== yB) return yA - yB;
          if (yA !== null) return -1;
          if (yB !== null) return 1;
          return a.id.localeCompare(b.id);
        });

        assignTierCoordinates(units, tierLevel, i);
      }
    }

    // Final Top-Down Alignment Pass
    for (let i = 1; i < sortedTiers.length; i++) {
      const tierLevel = sortedTiers[i];
      const units = tierUnits.get(tierLevel) || [];
      if (units.length <= 1) continue;

      const barycenters = new Map<string, { barycenter: number; hasParents: boolean; parentGroupKey: string }>();
      units.forEach((u) => {
        barycenters.set(u.id, computeParentBarycenter(u));
      });

      units.sort((a, b) => {
        const bA = barycenters.get(a.id)!;
        const bB = barycenters.get(b.id)!;

        if (Math.abs(bA.barycenter - bB.barycenter) > 0.001) {
          return bA.barycenter - bB.barycenter;
        }

        if (bA.parentGroupKey && bB.parentGroupKey && bA.parentGroupKey === bB.parentGroupKey) {
          const yA = parseYear(a.people[0]?.birth_date);
          const yB = parseYear(b.people[0]?.birth_date);
          if (yA !== null && yB !== null && yA !== yB) return yA - yB;
          if (yA !== null) return -1;
          if (yB !== null) return 1;
          return a.id.localeCompare(b.id);
        }

        const yA = parseYear(a.people[0]?.birth_date);
        const yB = parseYear(b.people[0]?.birth_date);
        if (yA !== null && yB !== null && yA !== yB) return yA - yB;
        if (yA !== null) return -1;
        if (yB !== null) return 1;
        return a.id.localeCompare(b.id);
      });

      assignTierCoordinates(units, tierLevel, i);
    }

    const calculatedNodes: PositionedNode[] = Array.from(nodeMap.values());

    // 6. Generate Bundled Family Union & Sibling Bus Edges with Staggering and Jump Arcs
    interface HorizontalLineSegment {
      id: string;
      xMin: number;
      xMax: number;
      y: number;
    }

    interface PendingVerticalLine {
      id: string;
      type: 'parent_child';
      role: 'stem' | 'ingress';
      x: number;
      y1: number;
      y2: number;
      sourceNode: PositionedNode;
      targetNode: PositionedNode;
    }

    const horizontalSegments: HorizontalLineSegment[] = [];
    const pendingVerticalLines: PendingVerticalLine[] = [];
    const renderedConns: RenderedEdge[] = [];
    const coveredPartnerPairs = new Set<string>();

    sortedTiers.forEach((tierLevel) => {
      const units = tierUnits.get(tierLevel) || [];

      units.forEach((unit, unitIndex) => {
        const busYOffset = (unitIndex % 2 === 1) ? 16 : -16;

        if (unit.type === 'couple') {
          const [p1, p2] = unit.people;
          const node1 = nodeMap.get(p1.id);
          const node2 = nodeMap.get(p2.id);
          if (!node1 || !node2) return;

          coveredPartnerPairs.add(`${p1.id}:${p2.id}`);
          coveredPartnerPairs.add(`${p2.id}:${p1.id}`);

          const leftNode = node1.x < node2.x ? node1 : node2;
          const rightNode = node1.x < node2.x ? node2 : node1;

          const startX = leftNode.x + leftNode.width;
          const startY = leftNode.y + leftNode.height / 2;
          const endX = rightNode.x;
          const endY = rightNode.y + rightNode.height / 2;
          const midX = (startX + endX) / 2;
          const midY = (startY + endY) / 2;

          const isStraightMarriage = Math.abs(startY - endY) < 10;
          if (isStraightMarriage) {
            horizontalSegments.push({
              id: `marriage-${unit.id}`,
              xMin: Math.min(startX, endX),
              xMax: Math.max(startX, endX),
              y: midY,
            });
          }

          // Horizontal Marriage Line between partners
          renderedConns.push({
            id: `marriage-${unit.id}`,
            type: 'partner',
            role: 'marriage',
            pathData: isStraightMarriage
              ? `M ${startX} ${startY} L ${endX} ${endY}`
              : `M ${startX} ${startY} C ${startX + 30} ${startY}, ${endX - 30} ${endY}, ${endX} ${endY}`,
            sourceNode: leftNode,
            targetNode: rightNode,
            midX,
            midY,
          });

          // Identify children belonging to this couple
          const childIdSet = new Set<string>();
          (parentToChildren.get(p1.id) || []).forEach((cid) => childIdSet.add(cid));
          (parentToChildren.get(p2.id) || []).forEach((cid) => childIdSet.add(cid));

          const children = Array.from(childIdSet)
            .map((cid) => nodeMap.get(cid))
            .filter((cNode): cNode is PositionedNode => !!cNode && cNode.y > leftNode.y)
            .sort((a, b) => a.x - b.x);

          if (children.length > 0) {
            const yBus = leftNode.y + NODE_HEIGHT + VERTICAL_GAP / 2 + busYOffset;

            // Sibling Distribution Bus
            const childXs = children.map((c) => c.x + c.width / 2);
            const busStartX = Math.min(midX, ...childXs);
            const busEndX = Math.max(midX, ...childXs);

            if (busStartX < busEndX) {
              horizontalSegments.push({
                id: `bus-${unit.id}`,
                xMin: busStartX,
                xMax: busEndX,
                y: yBus,
              });

              renderedConns.push({
                id: `bus-${unit.id}`,
                type: 'parent_child',
                role: 'bus',
                pathData: `M ${busStartX} ${yBus} L ${busEndX} ${yBus}`,
                sourceNode: leftNode,
                targetNode: children[0],
              });
            }

            // Union Drop Stem (from union midpoint down to inter-tier sibling bus)
            pendingVerticalLines.push({
              id: `stem-${unit.id}`,
              type: 'parent_child',
              role: 'stem',
              x: midX,
              y1: midY,
              y2: yBus,
              sourceNode: leftNode,
              targetNode: children[0],
            });

            // Single Ingress Line per Child
            children.forEach((cNode) => {
              const cX = cNode.x + cNode.width / 2;
              pendingVerticalLines.push({
                id: `ingress-${unit.id}-${cNode.person.id}`,
                type: 'parent_child',
                role: 'ingress',
                x: cX,
                y1: yBus,
                y2: cNode.y,
                sourceNode: leftNode,
                targetNode: cNode,
              });
            });
          }
        } else if (unit.type === 'single') {
          const p = unit.people[0];
          const parentNode = nodeMap.get(p.id);
          if (!parentNode) return;

          const children = (parentToChildren.get(p.id) || [])
            .map((cid) => nodeMap.get(cid))
            .filter((cNode): cNode is PositionedNode => !!cNode && cNode.y > parentNode.y)
            .sort((a, b) => a.x - b.x);

          if (children.length > 0) {
            const pCenterX = parentNode.x + parentNode.width / 2;
            const pBottomY = parentNode.y + parentNode.height;
            const yBus = parentNode.y + NODE_HEIGHT + VERTICAL_GAP / 2 + busYOffset;

            // Sibling Distribution Bus
            const childXs = children.map((c) => c.x + c.width / 2);
            const busStartX = Math.min(pCenterX, ...childXs);
            const busEndX = Math.max(pCenterX, ...childXs);

            if (busStartX < busEndX) {
              horizontalSegments.push({
                id: `bus-${unit.id}`,
                xMin: busStartX,
                xMax: busEndX,
                y: yBus,
              });

              renderedConns.push({
                id: `bus-${unit.id}`,
                type: 'parent_child',
                role: 'bus',
                pathData: `M ${busStartX} ${yBus} L ${busEndX} ${yBus}`,
                sourceNode: parentNode,
                targetNode: children[0],
              });
            }

            // Single Parent Drop Stem (from bottom center of parent card down to bus)
            pendingVerticalLines.push({
              id: `stem-${unit.id}`,
              type: 'parent_child',
              role: 'stem',
              x: pCenterX,
              y1: pBottomY,
              y2: yBus,
              sourceNode: parentNode,
              targetNode: children[0],
            });

            // Single Ingress Line per Child
            children.forEach((cNode) => {
              const cX = cNode.x + cNode.width / 2;
              pendingVerticalLines.push({
                id: `ingress-${unit.id}-${cNode.person.id}`,
                type: 'parent_child',
                role: 'ingress',
                x: cX,
                y1: yBus,
                y2: cNode.y,
                sourceNode: parentNode,
                targetNode: cNode,
              });
            });
          }
        }
      });
    });

    // Fallback for any cross-tier or unmatched partner edges
    edges.forEach((e) => {
      if (e.edge_type === 'partner') {
        const pairKey = `${e.source_id}:${e.target_id}`;
        if (!coveredPartnerPairs.has(pairKey)) {
          const sourceNode = nodeMap.get(e.source_id);
          const targetNode = nodeMap.get(e.target_id);
          if (sourceNode && targetNode) {
            coveredPartnerPairs.add(pairKey);
            coveredPartnerPairs.add(`${e.target_id}:${e.source_id}`);

            const isSourceLeft = sourceNode.x < targetNode.x;
            const leftNode = isSourceLeft ? sourceNode : targetNode;
            const rightNode = isSourceLeft ? targetNode : sourceNode;

            const startX = leftNode.x + leftNode.width;
            const startY = leftNode.y + leftNode.height / 2;
            const endX = rightNode.x;
            const endY = rightNode.y + rightNode.height / 2;
            const midX = (startX + endX) / 2;
            const midY = (startY + endY) / 2;

            const isStraight = Math.abs(leftNode.y - rightNode.y) < 10;
            if (isStraight) {
              horizontalSegments.push({
                id: e.id,
                xMin: Math.min(startX, endX),
                xMax: Math.max(startX, endX),
                y: midY,
              });
            }

            renderedConns.push({
              id: e.id,
              type: 'partner',
              role: 'marriage',
              pathData: isStraight
                ? `M ${startX} ${startY} L ${endX} ${endY}`
                : `M ${startX} ${startY} C ${startX + 30} ${startY}, ${endX - 30} ${endY}, ${endX} ${endY}`,
              sourceNode,
              targetNode,
              midX,
              midY,
            });
          }
        }
      }
    });

    // Resolve all pending vertical lines with jump arc bridges over crossing horizontal lines
    pendingVerticalLines.forEach((vline) => {
      renderedConns.push({
        id: vline.id,
        type: vline.type,
        role: vline.role,
        pathData: buildVerticalPath(vline.x, vline.y1, vline.y2, horizontalSegments),
        sourceNode: vline.sourceNode,
        targetNode: vline.targetNode,
      });
    });

    // 7. Calculate bounding box
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
      connections: renderedConns,
      bounds: {
        minX: minX - 100,
        minY: minY - 50,
        maxX: maxX + 100,
        maxY: maxY + 100,
        width: Math.max(800, maxX - minX + 200),
        height: Math.max(600, maxY - minY + 150),
      },
    };
  }, [people, edges, customPositions]);

  // Center on focus person if specified
  useEffect(() => {
    if (focusPersonId && focusPersonId !== centeredPersonIdRef.current && nodes.length > 0) {
      const target = nodes.find((n) => n.person.id === focusPersonId);
      if (target) {
        centeredPersonIdRef.current = focusPersonId;
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

  const handleResetLayout = () => {
    setCustomPositions({});
    latestCustomPositionsRef.current = {};
    onResetPositions?.();
  };

  // Drag pan handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button === 0) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggedNodeRef.current) {
      const dx = (e.clientX - draggedNodeRef.current.startPointerX) / zoom;
      const dy = (e.clientY - draggedNodeRef.current.startPointerY) / zoom;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
        draggedNodeRef.current.hasMoved = true;
      }
      const newX = Math.round(draggedNodeRef.current.startNodeX + dx);
      const newY = Math.round(draggedNodeRef.current.startNodeY + dy);
      setCustomPositions((prev) => {
        const next = { ...prev, [draggedNodeRef.current!.id]: { x: newX, y: newY } };
        latestCustomPositionsRef.current = next;
        return next;
      });
    } else if (isDragging) {
      setPan({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  };

  const handleMouseUp = () => {
    if (draggedNodeRef.current) {
      if (draggedNodeRef.current.hasMoved) {
        onSavePositions?.(latestCustomPositionsRef.current);
        justDraggedRef.current = true;
        setTimeout(() => {
          justDraggedRef.current = false;
        }, 200);
      }
      draggedNodeRef.current = null;
      setDraggedNodeId(null);
    }
    setIsDragging(false);
  };

  useEffect(() => {
    const onWindowMouseMove = (e: MouseEvent) => {
      if (draggedNodeRef.current) {
        const dx = (e.clientX - draggedNodeRef.current.startPointerX) / zoom;
        const dy = (e.clientY - draggedNodeRef.current.startPointerY) / zoom;
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          draggedNodeRef.current.hasMoved = true;
        }
        const newX = Math.round(draggedNodeRef.current.startNodeX + dx);
        const newY = Math.round(draggedNodeRef.current.startNodeY + dy);
        setCustomPositions((prev) => {
          const next = { ...prev, [draggedNodeRef.current!.id]: { x: newX, y: newY } };
          latestCustomPositionsRef.current = next;
          return next;
        });
      }
    };

    const onWindowMouseUp = () => {
      if (draggedNodeRef.current) {
        if (draggedNodeRef.current.hasMoved) {
          onSavePositions?.(latestCustomPositionsRef.current);
          justDraggedRef.current = true;
          setTimeout(() => {
            justDraggedRef.current = false;
          }, 200);
        }
        draggedNodeRef.current = null;
        setDraggedNodeId(null);
      }
      setIsDragging(false);
    };

    window.addEventListener('mousemove', onWindowMouseMove);
    window.addEventListener('mouseup', onWindowMouseUp);
    return () => {
      window.removeEventListener('mousemove', onWindowMouseMove);
      window.removeEventListener('mouseup', onWindowMouseUp);
    };
  }, [zoom, onSavePositions]);

  // Multi-touch gestures (2-finger pan & pinch-zoom, 1-finger guidance toast)
  const handleCanvasTouchStart = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const midpoint = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
      const distance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      multiTouchRef.current = {
        midpoint,
        distance,
        startZoom: zoom,
        startPan: { ...pan },
      };
      singleTouchRef.current = null;
    } else if (e.touches.length === 1) {
      multiTouchRef.current = null;
      singleTouchRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        triggered: false,
      };
    }
  };

  const handleCanvasTouchMove = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 2) {
      e.preventDefault?.();
      if (!multiTouchRef.current) {
        const t1 = e.touches[0];
        const t2 = e.touches[1];
        const midpoint = {
          x: (t1.clientX + t2.clientX) / 2,
          y: (t1.clientY + t2.clientY) / 2,
        };
        const distance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
        multiTouchRef.current = {
          midpoint,
          distance,
          startZoom: zoom,
          startPan: { ...pan },
        };
        singleTouchRef.current = null;
        return;
      }

      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const currentMidpoint = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
      const currentDistance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

      const { midpoint: startMidpoint, distance: startDistance, startZoom, startPan } = multiTouchRef.current;

      const scaleRatio = startDistance > 0 ? currentDistance / startDistance : 1;
      const newZoom = Math.min(Math.max(startZoom * scaleRatio, 0.4), 3.0);

      // Invariant world coordinates under initial midpoint:
      const wx = (startMidpoint.x - startPan.x) / startZoom;
      const wy = (startMidpoint.y - startPan.y) / startZoom;

      const newPanX = currentMidpoint.x - wx * newZoom;
      const newPanY = currentMidpoint.y - wy * newZoom;

      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    } else if (e.touches.length === 1 && singleTouchRef.current) {
      const touch = e.touches[0];
      const delta = Math.hypot(touch.clientX - singleTouchRef.current.x, touch.clientY - singleTouchRef.current.y);
      if (!singleTouchRef.current.triggered && delta > 10) {
        singleTouchRef.current.triggered = true;
        triggerTouchGuidanceToast();
      }
    }
  };

  const handleCanvasTouchEnd = (e: React.TouchEvent<SVGSVGElement>) => {
    if (e.touches.length === 2) {
      const t1 = e.touches[0];
      const t2 = e.touches[1];
      const midpoint = {
        x: (t1.clientX + t2.clientX) / 2,
        y: (t1.clientY + t2.clientY) / 2,
      };
      const distance = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
      multiTouchRef.current = {
        midpoint,
        distance,
        startZoom: zoom,
        startPan: { ...pan },
      };
      singleTouchRef.current = null;
    } else if (e.touches.length === 1) {
      multiTouchRef.current = null;
      singleTouchRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        triggered: false,
      };
    } else {
      multiTouchRef.current = null;
      singleTouchRef.current = null;
    }
  };

  return (
    <div
      role="region"
      aria-label="Family Tree Overview Map"
      className="relative w-full h-[650px] bg-slate-100 rounded-3xl border-2 border-slate-300 overflow-hidden select-none flex flex-col shadow-inner"
    >
      {/* Top Controls & Legend Bar */}
      <div className="absolute top-4 left-4 right-4 z-10 flex flex-wrap items-center justify-between gap-3 pointer-events-none">
        <div className="bg-white/95 backdrop-blur-md px-4 py-2 rounded-2xl border-2 border-slate-200 shadow-md pointer-events-auto flex items-center gap-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-600" />
            <span className="font-bold text-slate-800 text-sm">
              Overview Map ({people.length} {people.length === 1 ? 'member' : 'members'})
            </span>
          </div>

          <div className="hidden sm:flex items-center gap-3 text-xs font-bold pl-2 border-l border-slate-200">
            <span className="flex items-center gap-1.5 text-rose-700 bg-rose-50 px-2.5 py-1 rounded-lg border border-rose-200">
              <span className="w-3 h-0.5 bg-rose-500 rounded inline-block" />
              <span>Partner</span>
            </span>
            <span className="flex items-center gap-1.5 text-slate-700 bg-slate-100 px-2.5 py-1 rounded-lg border border-slate-300">
              <span className="w-3 h-0.5 bg-slate-500 rounded inline-block" />
              <span>Parent → Child</span>
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 bg-white/95 backdrop-blur-md p-1.5 rounded-2xl border-2 border-slate-200 shadow-md pointer-events-auto">
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
          <button
            type="button"
            onClick={handleResetLayout}
            aria-label="Reset Auto-Layout"
            className="p-2 rounded-xl text-slate-700 hover:text-slate-900 hover:bg-slate-100 active:bg-slate-200 transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            title="Reset Auto-Layout"
          >
            <RotateCcw className="w-4 h-4" />
            <span className="hidden md:inline">Reset Auto-Layout</span>
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
          onTouchStart={handleCanvasTouchStart}
          onTouchMove={handleCanvasTouchMove}
          onTouchEnd={handleCanvasTouchEnd}
          onTouchCancel={handleCanvasTouchEnd}
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

            {/* Connecting Lines with Distinct Styles and Colors */}
            {connections.map((conn) => {
              const isPartner = conn.type === 'partner';
              const strokeColor = isPartner ? '#f43f5e' : '#64748b';
              const strokeWidth = 2.5;

              return (
                <g key={conn.id} data-testid={`map-edge-${conn.id}`}>
                  {/* Outer halo line for crisp contrast */}
                  <path
                    d={conn.pathData}
                    fill="none"
                    stroke={isPartner ? '#fecdd3' : '#f1f5f9'}
                    strokeWidth={strokeWidth + 3}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Main solid line */}
                  <path
                    d={conn.pathData}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Small central union circle/knot (radius 3.5px) at the union midpoint */}
                  {isPartner && conn.midX !== undefined && conn.midY !== undefined && (
                    <circle
                      cx={conn.midX}
                      cy={conn.midY}
                      r="3.5"
                      fill="#f43f5e"
                      stroke="#ffffff"
                      strokeWidth="1.5"
                      data-testid="union-knot"
                    />
                  )}
                </g>
              );
            })}

            {/* Person Nodes */}
            {nodes.map((node) => {
              const isFocus = node.person.id === (selectedPersonId || focusPersonId);
              const fullName = [node.person.first_name, node.person.last_name].filter(Boolean).join(' ');

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
                  data-testid={`map-node-${node.person.id}`}
                  transform={`translate(${node.x}, ${node.y})`}
                  onMouseDown={(e) => {
                    if (e.button === 0 && canEdit !== false) {
                      e.stopPropagation();
                      draggedNodeRef.current = {
                        id: node.person.id,
                        startPointerX: e.clientX,
                        startPointerY: e.clientY,
                        startNodeX: node.x,
                        startNodeY: node.y,
                        hasMoved: false,
                      };
                      setDraggedNodeId(node.person.id);
                    }
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (justDraggedRef.current) return;
                    setSelectedPersonId(node.person.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedPersonId(node.person.id);
                      onSelectPerson?.(node.person.id);
                    }
                  }}
                  tabIndex={0}
                  role="button"
                  aria-label={`${fullName}${datesLabel ? `, ${datesLabel}` : ''}`}
                  className={`${
                    canEdit !== false ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
                  } group focus:outline-none`}
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

                  {/* Avatar Element: Photo if available, or Initials */}
                  {node.person.avatar_url ? (
                    <g>
                      <defs>
                        <clipPath id={`avatar-clip-${node.person.id}`}>
                          <circle cx="32" cy="45" r="18" />
                        </clipPath>
                      </defs>
                      <circle
                        cx="32"
                        cy="45"
                        r="18"
                        className={isFocus ? 'fill-amber-200 stroke-amber-500 stroke-2' : 'fill-slate-100 stroke-slate-300 stroke-1'}
                      />
                      <image
                        href={node.person.avatar_url}
                        x="14"
                        y="27"
                        width="36"
                        height="36"
                        clipPath={`url(#avatar-clip-${node.person.id})`}
                        preserveAspectRatio="xMidYMid slice"
                      />
                    </g>
                  ) : (
                    <g>
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
                        {(node.person.first_name?.[0] || '').toUpperCase()}
                        {(node.person.last_name?.[0] || '').toUpperCase()}
                      </text>
                    </g>
                  )}

                  {/* Name Text - Clicking directly on name navigates to Focus View */}
                  <text
                    data-testid={`map-node-name-${node.person.id}`}
                    x="60"
                    y="38"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (justDraggedRef.current) return;
                      setSelectedPersonId(node.person.id);
                      onSelectPerson?.(node.person.id);
                    }}
                    className={`text-sm font-extrabold select-none cursor-pointer hover:underline ${
                      isFocus ? 'fill-slate-950 font-black' : 'fill-slate-900 hover:fill-amber-600'
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
                </g>
              );
            })}
          </g>
        </svg>
      )}

      {/* Floating Selected Person Action Bar */}
      {selectedPersonId && (
        (() => {
          const selected = people.find((p) => p.id === selectedPersonId);
          if (!selected) return null;
          return (
            <div
              data-testid="map-selected-toolbar"
              className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 bg-slate-900/95 backdrop-blur-md text-white border-2 border-amber-400 rounded-2xl px-5 py-3 shadow-2xl flex items-center gap-4 animate-in fade-in slide-in-from-bottom-2 duration-200"
            >
              <div className="flex items-center gap-2.5">
                {selected.avatar_url ? (
                  <img
                    src={selected.avatar_url}
                    alt={[selected.first_name, selected.last_name].filter(Boolean).join(' ')}
                    className="w-8 h-8 rounded-full object-cover border-2 border-amber-400"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-amber-500 text-slate-950 font-black flex items-center justify-center text-xs">
                    {(selected.first_name?.[0] || '').toUpperCase()}
                    {(selected.last_name?.[0] || '').toUpperCase()}
                  </div>
                )}
                <div>
                  <p className="text-sm font-extrabold leading-tight">
                    {[selected.first_name, selected.last_name].filter(Boolean).join(' ')}
                  </p>
                  <p className="text-[11px] text-slate-300 font-medium">
                    {selected.birth_date ? `b. ${selected.birth_date}` : 'Family Member'}
                  </p>
                </div>
              </div>

              <div className="h-6 w-px bg-slate-700" />

              <div className="flex items-center gap-2">
                {onEditPerson && (
                  <button
                    type="button"
                    onClick={() => onEditPerson(selected)}
                    className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow cursor-pointer flex items-center gap-1.5 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                    <span>Edit Details</span>
                  </button>
                )}

                {onSelectPerson && (
                  <button
                    type="button"
                    onClick={() => onSelectPerson(selected.id)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs border border-slate-600 cursor-pointer flex items-center gap-1.5 transition-colors"
                  >
                    <Eye className="w-3.5 h-3.5 text-blue-400" />
                    <span>Focus View</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setSelectedPersonId(null)}
                  aria-label="Close selection bar"
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })()
      )}

      {/* Floating Touch Guidance Toast */}
      {showTouchToast && (
        <div
          role="status"
          aria-live="polite"
          data-testid="map-touch-toast"
          className="absolute bottom-6 left-1/2 -translate-x-1/2 z-30 bg-slate-900/90 backdrop-blur-md text-white text-xs font-semibold px-4 py-2.5 rounded-full shadow-lg border border-slate-700 pointer-events-none transition-opacity duration-300 animate-in fade-in"
        >
          Use two fingers to pan and zoom the map
        </div>
      )}
    </div>
  );
};
