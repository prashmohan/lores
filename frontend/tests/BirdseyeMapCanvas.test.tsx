import { render, screen, fireEvent, within, createEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { BirdseyeMapCanvas, type MapPerson } from '../src/components/map/BirdseyeMapCanvas';

const mockPeople: MapPerson[] = [
  {
    id: '1',
    first_name: 'Arthur',
    last_name: 'Miller',
    gender: 'male',
    birth_date: '1915',
    death_date: '2005',
    is_living: false,
  },
  {
    id: '2',
    first_name: 'Augusta',
    last_name: 'Barnett',
    gender: 'female',
    birth_date: '1918',
    death_date: '1998',
    is_living: false,
  },
  {
    id: '3',
    first_name: 'Margaret',
    last_name: 'Miller',
    gender: 'female',
    birth_date: '1942',
    death_date: null,
    is_living: true,
  },
  {
    id: '4',
    first_name: 'Ronald',
    last_name: 'Vance',
    gender: 'male',
    birth_date: '1968',
    death_date: null,
    is_living: true,
  },
];

describe('BirdseyeMapCanvas', () => {
  it('renders SVG map canvas with nodes for each person', () => {
    const onSelectPerson = vi.fn();

    render(
      <BirdseyeMapCanvas
        people={mockPeople}
        focusPersonId="3"
        onSelectPerson={onSelectPerson}
      />
    );

    expect(screen.getByRole('region', { name: /Family Tree Overview Map/i })).toBeInTheDocument();
    expect(screen.getByText(/Arthur Miller/i)).toBeInTheDocument();
    expect(screen.getByText(/Augusta Barnett/i)).toBeInTheDocument();
    expect(screen.getByText(/Margaret Miller/i)).toBeInTheDocument();
    expect(screen.getByText(/Ronald Vance/i)).toBeInTheDocument();
  });

  it('triggers onSelectPerson when a person name is clicked directly, and selects node when card is clicked', () => {
    const onSelectPerson = vi.fn();

    render(
      <BirdseyeMapCanvas
        people={mockPeople}
        focusPersonId="3"
        onSelectPerson={onSelectPerson}
      />
    );

    // Clicking card selects node (opens toolbar)
    const arthurNode = screen.getByTestId('map-node-1');
    fireEvent.click(arthurNode);
    expect(screen.getByTestId('map-selected-toolbar')).toBeInTheDocument();
    expect(onSelectPerson).not.toHaveBeenCalled();

    // Clicking name text directly triggers onSelectPerson
    const arthurName = screen.getByTestId('map-node-name-1');
    fireEvent.click(arthurName);
    expect(onSelectPerson).toHaveBeenCalledWith('1');

    const ronaldName = screen.getByTestId('map-node-name-4');
    fireEvent.click(ronaldName);
    expect(onSelectPerson).toHaveBeenCalledWith('4');
  });

  it('triggers onSelectPerson on keyboard Enter or Space', () => {
    const onSelectPerson = vi.fn();

    render(
      <BirdseyeMapCanvas
        people={mockPeople}
        focusPersonId="3"
        onSelectPerson={onSelectPerson}
      />
    );

    const margaretNode = screen.getByTestId('map-node-3');
    fireEvent.keyDown(margaretNode, { key: 'Enter' });
    expect(onSelectPerson).toHaveBeenCalledWith('3');

    fireEvent.keyDown(margaretNode, { key: ' ' });
    expect(onSelectPerson).toHaveBeenCalledWith('3');
  });

  it('handles zoom in, zoom out, and reset controls without crashing', () => {
    render(
      <BirdseyeMapCanvas
        people={mockPeople}
        focusPersonId="3"
      />
    );

    const zoomInBtn = screen.getByRole('button', { name: /Zoom In/i });
    const zoomOutBtn = screen.getByRole('button', { name: /Zoom Out/i });
    const resetBtn = screen.getByRole('button', { name: /Reset View/i });

    fireEvent.click(zoomInBtn);
    fireEvent.click(zoomOutBtn);
    fireEvent.click(resetBtn);

    expect(screen.getByRole('region', { name: /Family Tree Overview Map/i })).toBeInTheDocument();
  });

  it('renders empty state when people list is empty', () => {
    render(<BirdseyeMapCanvas people={[]} />);

    expect(screen.getByText(/No Family Records Yet/i)).toBeInTheDocument();
    expect(screen.getByText(/Add family members in the Focus View/i)).toBeInTheDocument();
  });

  it('renders partner and parent-child edges with distinct colors and legend', () => {
    const mockEdges = [
      { id: 'e1', source_id: '1', target_id: '2', edge_type: 'partner' },
      { id: 'e2', source_id: '1', target_id: '3', edge_type: 'parent_child' },
      { id: 'e3', source_id: '2', target_id: '3', edge_type: 'parent_child' },
    ];

    const { container } = render(
      <BirdseyeMapCanvas
        people={mockPeople}
        edges={mockEdges}
        focusPersonId="3"
      />
    );

    // Legend is present
    expect(screen.getByText('Partner')).toBeInTheDocument();
    expect(screen.getByText('Parent → Child')).toBeInTheDocument();

    // Check SVG paths
    const paths = container.querySelectorAll('svg g g path');
    expect(paths.length).toBeGreaterThan(0);

    // Check stroke colors
    const partnerStroke = Array.from(paths).some((p) => p.getAttribute('stroke') === '#f43f5e');
    const pcStroke = Array.from(paths).some((p) => p.getAttribute('stroke') === '#64748b');

    expect(partnerStroke).toBe(true);
    expect(pcStroke).toBe(true);
  });

  it('triggers onEditPerson and renders floating toolbar on selection', () => {
    const onSelectPerson = vi.fn();
    const onEditPerson = vi.fn();

    render(
      <BirdseyeMapCanvas
        people={mockPeople}
        focusPersonId="3"
        onSelectPerson={onSelectPerson}
        onEditPerson={onEditPerson}
      />
    );

    // Click on Ronald Vance node
    const ronaldNode = screen.getByTestId('map-node-4');
    fireEvent.click(ronaldNode);

    // Floating action bar appears
    const toolbar = screen.getByTestId('map-selected-toolbar');
    expect(toolbar).toBeInTheDocument();
    expect(within(toolbar).getByText('Ronald Vance')).toBeInTheDocument();

    // Click Edit Details from toolbar
    const editDetailsBtn = within(toolbar).getByRole('button', { name: /^Edit Details$/i });
    fireEvent.click(editDetailsBtn);
    expect(onEditPerson).toHaveBeenCalledWith(
      expect.objectContaining({ id: '4', first_name: 'Ronald' })
    );

    // Click Focus View from toolbar
    const focusViewBtn = within(toolbar).getByRole('button', { name: /^Focus View$/i });
    fireEvent.click(focusViewBtn);
    expect(onSelectPerson).toHaveBeenCalledWith('4');
  });

  const makePerson = (id: string, first_name: string, last_name: string, birth_date?: string): MapPerson => ({
    id,
    first_name,
    last_name,
    gender: 'unknown',
    is_living: true,
    birth_date: birth_date ?? null,
    death_date: null,
  });

  it('places partners in a couple directly adjacent with 24px gap', () => {
    const people: MapPerson[] = [
      makePerson('p1', 'Arthur', 'Miller', '1915'),
      makePerson('p2', 'Augusta', 'Barnett', '1918'),
      makePerson('p3', 'Single', 'Person', '1916'),
    ];
    const edges = [
      { id: 'e1', source_id: 'p1', target_id: 'p2', edge_type: 'partner' as const },
    ];

    render(<BirdseyeMapCanvas people={people} edges={edges} />);

    const getPos = (id: string) => {
      const el = screen.getByTestId(`map-node-${id}`);
      const match = el.getAttribute('transform')?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
      if (!match) throw new Error('No transform');
      return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
    };

    const pos1 = getPos('p1');
    const pos2 = getPos('p2');
    const pos3 = getPos('p3');

    // Partners in the couple should have exactly 210 + 24 = 234 distance between their X start positions
    expect(Math.abs(pos2.x - pos1.x)).toBe(234);
    expect(pos1.y).toBe(pos2.y);

    // Spacing between couple unit and single unit should be >= 50px gap
    const coupleMinX = Math.min(pos1.x, pos2.x);
    const coupleMaxX = Math.max(pos1.x, pos2.x) + 210;
    if (pos3.x > coupleMaxX) {
      expect(pos3.x - coupleMaxX).toBeGreaterThanOrEqual(50);
    } else {
      expect(coupleMinX - (pos3.x + 210)).toBeGreaterThanOrEqual(50);
    }
  });

  it('orders children horizontally corresponding to parent horizontal positions', () => {
    const people: MapPerson[] = [
      makePerson('cb', 'Child', 'B', '1975'),
      makePerson('b1', 'Father', 'B', '1945'),
      makePerson('b2', 'Mother', 'B', '1947'),
      makePerson('ca', 'Child', 'A', '1970'),
      makePerson('a1', 'Father', 'A', '1940'),
      makePerson('a2', 'Mother', 'A', '1942'),
    ];
    const edges = [
      { id: 'e1', source_id: 'a1', target_id: 'a2', edge_type: 'partner' as const },
      { id: 'e2', source_id: 'a1', target_id: 'ca', edge_type: 'parent_child' as const },
      { id: 'e3', source_id: 'a2', target_id: 'ca', edge_type: 'parent_child' as const },
      { id: 'e4', source_id: 'b1', target_id: 'b2', edge_type: 'partner' as const },
      { id: 'e5', source_id: 'b1', target_id: 'cb', edge_type: 'parent_child' as const },
      { id: 'e6', source_id: 'b2', target_id: 'cb', edge_type: 'parent_child' as const },
    ];

    render(<BirdseyeMapCanvas people={people} edges={edges} />);

    const getPos = (id: string) => {
      const el = screen.getByTestId(`map-node-${id}`);
      const match = el.getAttribute('transform')?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
      if (!match) throw new Error('No transform');
      return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
    };

    const posA1 = getPos('a1');
    const posB1 = getPos('b1');
    const posCA = getPos('ca');
    const posCB = getPos('cb');

    if (posA1.x < posB1.x) {
      expect(posCA.x).toBeLessThan(posCB.x);
    } else {
      expect(posCB.x).toBeLessThan(posCA.x);
    }
  });

  it('keeps full siblings grouped contiguously under their shared parents', () => {
    const people: MapPerson[] = [
      makePerson('p1', 'Parent', '1', '1940'),
      makePerson('p2', 'Parent', '2', '1942'),
      makePerson('c1', 'Child', '1', '1970'),
      makePerson('c2', 'Child', '2', '1972'),
      makePerson('c3', 'Child', '3', '1975'),
      makePerson('other', 'Other', 'Child', '1971'),
      makePerson('op1', 'Other', 'Parent', '1941'),
    ];
    const edges = [
      { id: 'e1', source_id: 'p1', target_id: 'p2', edge_type: 'partner' as const },
      { id: 'e2', source_id: 'p1', target_id: 'c1', edge_type: 'parent_child' as const },
      { id: 'e3', source_id: 'p1', target_id: 'c2', edge_type: 'parent_child' as const },
      { id: 'e4', source_id: 'p1', target_id: 'c3', edge_type: 'parent_child' as const },
      { id: 'e5', source_id: 'op1', target_id: 'other', edge_type: 'parent_child' as const },
    ];

    render(<BirdseyeMapCanvas people={people} edges={edges} />);

    const getPos = (id: string) => {
      const el = screen.getByTestId(`map-node-${id}`);
      const match = el.getAttribute('transform')?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
      if (!match) throw new Error('No transform');
      return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
    };

    const posC1 = getPos('c1');
    const posC2 = getPos('c2');
    const posC3 = getPos('c3');
    const posOther = getPos('other');

    const siblingXs = [posC1.x, posC2.x, posC3.x].sort((a, b) => a - b);
    expect(siblingXs[1] - siblingXs[0]).toBe(280);
    expect(siblingXs[2] - siblingXs[1]).toBe(280);

    expect(posOther.x < siblingXs[0] || posOther.x > siblingXs[2]).toBe(true);
  });

  it('relaxes parent ordering bottom-up to center over children', () => {
    // Parents: Family A (born 1945) and Family B (born 1940, earlier)
    // Children: Son A (child of Family A) and Daughter B (child of Family B) are married as a couple [Son A, Daughter B]
    const people: MapPerson[] = [
      makePerson('fb', 'Father', 'B', '1940'),
      makePerson('mb', 'Mother', 'B', '1942'),
      makePerson('fa', 'Father', 'A', '1945'),
      makePerson('ma', 'Mother', 'A', '1947'),
      makePerson('sa', 'Son', 'A', '1968'),
      makePerson('db', 'Daughter', 'B', '1970'),
    ];
    const edges = [
      { id: 'e1', source_id: 'fa', target_id: 'ma', edge_type: 'partner' as const },
      { id: 'e2', source_id: 'fb', target_id: 'mb', edge_type: 'partner' as const },
      { id: 'e3', source_id: 'fa', target_id: 'sa', edge_type: 'parent_child' as const },
      { id: 'e4', source_id: 'fb', target_id: 'db', edge_type: 'parent_child' as const },
      { id: 'e5', source_id: 'sa', target_id: 'db', edge_type: 'partner' as const },
    ];

    render(<BirdseyeMapCanvas people={people} edges={edges} />);

    const getPos = (id: string) => {
      const el = screen.getByTestId(`map-node-${id}`);
      const match = el.getAttribute('transform')?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
      if (!match) throw new Error('No transform');
      return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
    };

    const posFA = getPos('fa');
    const posFB = getPos('fb');
    const posSA = getPos('sa');
    const posDB = getPos('db');

    // In Tier 1, Son A is on the left of Daughter B in their couple unit
    expect(posSA.x).toBeLessThan(posDB.x);

    // Bottom-up pass ensures Father A is relaxed to the left of Father B to align above Son A
    expect(posFA.x).toBeLessThan(posFB.x);
  });

  it('guarantees no horizontal or vertical node overlaps in complex tree', () => {
    const people: MapPerson[] = [
      makePerson('g1', 'Grandpa', '1', '1910'),
      makePerson('g2', 'Grandma', '1', '1912'),
      makePerson('p1', 'Father', '1', '1938'),
      makePerson('p2', 'Mother', '1', '1940'),
      makePerson('p3', 'Uncle', '1', '1942'),
      makePerson('c1', 'Child', '1', '1968'),
      makePerson('c2', 'Child', '2', '1970'),
      makePerson('c3', 'Child', '3', '1974'),
      makePerson('c4', 'Cousin', '1', '1972'),
    ];
    const edges = [
      { id: 'e1', source_id: 'g1', target_id: 'g2', edge_type: 'partner' as const },
      { id: 'e2', source_id: 'g1', target_id: 'p1', edge_type: 'parent_child' as const },
      { id: 'e3', source_id: 'g1', target_id: 'p3', edge_type: 'parent_child' as const },
      { id: 'e4', source_id: 'p1', target_id: 'p2', edge_type: 'partner' as const },
      { id: 'e5', source_id: 'p1', target_id: 'c1', edge_type: 'parent_child' as const },
      { id: 'e6', source_id: 'p1', target_id: 'c2', edge_type: 'parent_child' as const },
      { id: 'e7', source_id: 'p1', target_id: 'c3', edge_type: 'parent_child' as const },
      { id: 'e8', source_id: 'p3', target_id: 'c4', edge_type: 'parent_child' as const },
    ];

    render(<BirdseyeMapCanvas people={people} edges={edges} />);

    const getPos = (id: string) => {
      const el = screen.getByTestId(`map-node-${id}`);
      const match = el.getAttribute('transform')?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
      if (!match) throw new Error('No transform');
      return { x: parseFloat(match[1]), y: parseFloat(match[2]), width: 210, height: 90 };
    };

    const nodes = people.map((p) => ({ id: p.id, ...getPos(p.id) }));

    // Group by Y coordinate (tier)
    const tierGroups = new Map<number, typeof nodes>();
    nodes.forEach((n) => {
      if (!tierGroups.has(n.y)) tierGroups.set(n.y, []);
      tierGroups.get(n.y)!.push(n);
    });

    // Check vertical separation between tiers
    const yLevels = Array.from(tierGroups.keys()).sort((a, b) => a - b);
    for (let i = 1; i < yLevels.length; i++) {
      expect(yLevels[i] - yLevels[i - 1]).toBeGreaterThanOrEqual(90 + 140);
    }

    // Check horizontal separation within each tier (no two nodes overlap)
    tierGroups.forEach((tierNodes) => {
      const sorted = [...tierNodes].sort((a, b) => a.x - b.x);
      for (let i = 1; i < sorted.length; i++) {
        // Minimum gap between any two adjacent nodes is 24px (couple) or 50px (units)
        expect(sorted[i].x - (sorted[i - 1].x + sorted[i - 1].width)).toBeGreaterThanOrEqual(24);
      }
    });
  });

  it('renders family union junction, drop stem, sibling bus, and 3 single ingress lines for 2 parents + 3 children', () => {
    const people: MapPerson[] = [
      makePerson('p1', 'Arthur', 'Miller', '1915'),
      makePerson('p2', 'Augusta', 'Barnett', '1918'),
      makePerson('c1', 'Jane', 'Miller', '1940'),
      makePerson('c2', 'Robert', 'Miller', '1943'),
      makePerson('c3', 'Daniel', 'Miller', '1947'),
    ];
    const edges = [
      { id: 'e1', source_id: 'p1', target_id: 'p2', edge_type: 'partner' as const },
      { id: 'e2', source_id: 'p1', target_id: 'c1', edge_type: 'parent_child' as const },
      { id: 'e3', source_id: 'p2', target_id: 'c1', edge_type: 'parent_child' as const },
      { id: 'e4', source_id: 'p1', target_id: 'c2', edge_type: 'parent_child' as const },
      { id: 'e5', source_id: 'p2', target_id: 'c2', edge_type: 'parent_child' as const },
      { id: 'e6', source_id: 'p1', target_id: 'c3', edge_type: 'parent_child' as const },
      { id: 'e7', source_id: 'p2', target_id: 'c3', edge_type: 'parent_child' as const },
    ];

    const { container } = render(<BirdseyeMapCanvas people={people} edges={edges} />);

    const getPos = (id: string) => {
      const el = screen.getByTestId(`map-node-${id}`);
      const match = el.getAttribute('transform')?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
      if (!match) throw new Error('No transform');
      return { x: parseFloat(match[1]), y: parseFloat(match[2]), width: 210, height: 90 };
    };

    const p1Pos = getPos('p1');
    const p2Pos = getPos('p2');
    const c1Pos = getPos('c1');
    const c2Pos = getPos('c2');
    const c3Pos = getPos('c3');

    // 1. Marriage line exists between parents
    const marriageEdge = screen.getByTestId('map-edge-marriage-couple-p1-p2');
    expect(marriageEdge).toBeInTheDocument();
    const leftNodePos = p1Pos.x < p2Pos.x ? p1Pos : p2Pos;
    const rightNodePos = p1Pos.x < p2Pos.x ? p2Pos : p1Pos;
    const marriagePath = marriageEdge.querySelectorAll('path')[1];
    expect(marriagePath.getAttribute('d')).toBe(
      `M ${leftNodePos.x + 210} ${leftNodePos.y + 45} L ${rightNodePos.x} ${rightNodePos.y + 45}`
    );

    // 2. Union knot circle exists at midpoint with radius 3.5
    const unionKnots = container.querySelectorAll('[data-testid="union-knot"]');
    expect(unionKnots.length).toBe(1);
    expect(unionKnots[0].getAttribute('r')).toBe('3.5');
    const unionMidX = (leftNodePos.x + 210 + rightNodePos.x) / 2;
    const unionMidY = leftNodePos.y + 45;
    expect(parseFloat(unionKnots[0].getAttribute('cx') || '0')).toBeCloseTo(unionMidX);
    expect(parseFloat(unionKnots[0].getAttribute('cy') || '0')).toBeCloseTo(unionMidY);

    // 3. Union drop stem exists dropping down to Y_bus = 90 + 90 + 70 - 16 = 234
    const yBus = leftNodePos.y + 90 + 70 - 16;
    const stemEdge = screen.getByTestId('map-edge-stem-couple-p1-p2');
    expect(stemEdge).toBeInTheDocument();
    const stemPath = stemEdge.querySelectorAll('path')[1];
    expect(stemPath.getAttribute('d')).toBe(`M ${unionMidX} ${unionMidY} L ${unionMidX} ${yBus}`);

    // 4. Sibling bus exists at Y_bus spanning the children and union
    const busEdge = screen.getByTestId('map-edge-bus-couple-p1-p2');
    expect(busEdge).toBeInTheDocument();
    const busPath = busEdge.querySelectorAll('path')[1];
    const childXs = [c1Pos.x + 105, c2Pos.x + 105, c3Pos.x + 105];
    const expectedBusMinX = Math.min(unionMidX, ...childXs);
    const expectedBusMaxX = Math.max(unionMidX, ...childXs);
    expect(busPath.getAttribute('d')).toBe(`M ${expectedBusMinX} ${yBus} L ${expectedBusMaxX} ${yBus}`);

    // 5. Exactly 3 child ingress drop points (one per child)
    const ingressC1 = screen.getByTestId('map-edge-ingress-couple-p1-p2-c1');
    const ingressC2 = screen.getByTestId('map-edge-ingress-couple-p1-p2-c2');
    const ingressC3 = screen.getByTestId('map-edge-ingress-couple-p1-p2-c3');

    expect(ingressC1).toBeInTheDocument();
    expect(ingressC2).toBeInTheDocument();
    expect(ingressC3).toBeInTheDocument();

    const ingressPathC1 = ingressC1.querySelectorAll('path')[1];
    const ingressPathC2 = ingressC2.querySelectorAll('path')[1];
    const ingressPathC3 = ingressC3.querySelectorAll('path')[1];

    expect(ingressPathC1.getAttribute('d')).toBe(`M ${c1Pos.x + 105} ${yBus} L ${c1Pos.x + 105} ${c1Pos.y}`);
    expect(ingressPathC2.getAttribute('d')).toBe(`M ${c2Pos.x + 105} ${yBus} L ${c2Pos.x + 105} ${c2Pos.y}`);
    expect(ingressPathC3.getAttribute('d')).toBe(`M ${c3Pos.x + 105} ${yBus} L ${c3Pos.x + 105} ${c3Pos.y}`);
  });

  it('renders vertical parent stem, sibling bus, and 2 child ingress lines for single parent + 2 children', () => {
    const people: MapPerson[] = [
      makePerson('p1', 'Single', 'Parent', '1940'),
      makePerson('c1', 'Child', 'One', '1970'),
      makePerson('c2', 'Child', 'Two', '1972'),
    ];
    const edges = [
      { id: 'e1', source_id: 'p1', target_id: 'c1', edge_type: 'parent_child' as const },
      { id: 'e2', source_id: 'p1', target_id: 'c2', edge_type: 'parent_child' as const },
    ];

    const { container } = render(<BirdseyeMapCanvas people={people} edges={edges} />);

    const getPos = (id: string) => {
      const el = screen.getByTestId(`map-node-${id}`);
      const match = el.getAttribute('transform')?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
      if (!match) throw new Error('No transform');
      return { x: parseFloat(match[1]), y: parseFloat(match[2]), width: 210, height: 90 };
    };

    const p1Pos = getPos('p1');
    const c1Pos = getPos('c1');
    const c2Pos = getPos('c2');

    // No marriage line or union knot
    expect(screen.queryByTestId(/map-edge-marriage-/)).not.toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="union-knot"]').length).toBe(0);

    // 1. Parent drop stem from bottom center of p1
    const p1CenterX = p1Pos.x + 105;
    const p1BottomY = p1Pos.y + 90;
    const yBus = p1Pos.y + 90 + 70 - 16;

    const stemEdge = screen.getByTestId('map-edge-stem-single-p1');
    expect(stemEdge).toBeInTheDocument();
    const stemPath = stemEdge.querySelectorAll('path')[1];
    expect(stemPath.getAttribute('d')).toBe(`M ${p1CenterX} ${p1BottomY} L ${p1CenterX} ${yBus}`);

    // 2. Sibling bus at Y_bus
    const busEdge = screen.getByTestId('map-edge-bus-single-p1');
    expect(busEdge).toBeInTheDocument();
    const busPath = busEdge.querySelectorAll('path')[1];
    const childXs = [c1Pos.x + 105, c2Pos.x + 105];
    const expectedBusMinX = Math.min(p1CenterX, ...childXs);
    const expectedBusMaxX = Math.max(p1CenterX, ...childXs);
    expect(busPath.getAttribute('d')).toBe(`M ${expectedBusMinX} ${yBus} L ${expectedBusMaxX} ${yBus}`);

    // 3. Child ingress lines (one per child)
    const ingressC1 = screen.getByTestId('map-edge-ingress-single-p1-c1');
    const ingressC2 = screen.getByTestId('map-edge-ingress-single-p1-c2');
    expect(ingressC1).toBeInTheDocument();
    expect(ingressC2).toBeInTheDocument();

    const ingressPathC1 = ingressC1.querySelectorAll('path')[1];
    const ingressPathC2 = ingressC2.querySelectorAll('path')[1];

    expect(ingressPathC1.getAttribute('d')).toBe(`M ${c1Pos.x + 105} ${yBus} L ${c1Pos.x + 105} ${c1Pos.y}`);
    expect(ingressPathC2.getAttribute('d')).toBe(`M ${c2Pos.x + 105} ${yBus} L ${c2Pos.x + 105} ${c2Pos.y}`);
  });

  it('renders only marriage line and union knot for childless couple', () => {
    const people: MapPerson[] = [
      makePerson('p1', 'Arthur', 'Miller', '1915'),
      makePerson('p2', 'Augusta', 'Barnett', '1918'),
    ];
    const edges = [
      { id: 'e1', source_id: 'p1', target_id: 'p2', edge_type: 'partner' as const },
    ];

    const { container } = render(<BirdseyeMapCanvas people={people} edges={edges} />);

    expect(screen.getByTestId('map-edge-marriage-couple-p1-p2')).toBeInTheDocument();
    expect(container.querySelectorAll('[data-testid="union-knot"]').length).toBe(1);
    expect(screen.queryByTestId(/map-edge-stem-/)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/map-edge-bus-/)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/map-edge-ingress-/)).not.toBeInTheDocument();
  });

  it('staggers sibling distributor buses vertically for adjacent families in the same tier', () => {
    const people: MapPerson[] = [
      makePerson('f1_p1', 'Father1', 'FamilyA', '1940'),
      makePerson('f1_p2', 'Mother1', 'FamilyA', '1942'),
      makePerson('f1_c1', 'ChildA1', 'FamilyA', '1970'),
      makePerson('f1_c2', 'ChildA2', 'FamilyA', '1972'),
      makePerson('f2_p1', 'Father2', 'FamilyB', '1941'),
      makePerson('f2_p2', 'Mother2', 'FamilyB', '1943'),
      makePerson('f2_c1', 'ChildB1', 'FamilyB', '1971'),
      makePerson('f2_c2', 'ChildB2', 'FamilyB', '1973'),
    ];
    const edges = [
      { id: 'e1', source_id: 'f1_p1', target_id: 'f1_p2', edge_type: 'partner' as const },
      { id: 'e2', source_id: 'f1_p1', target_id: 'f1_c1', edge_type: 'parent_child' as const },
      { id: 'e3', source_id: 'f1_p1', target_id: 'f1_c2', edge_type: 'parent_child' as const },
      { id: 'e4', source_id: 'f2_p1', target_id: 'f2_p2', edge_type: 'partner' as const },
      { id: 'e5', source_id: 'f2_p1', target_id: 'f2_c1', edge_type: 'parent_child' as const },
      { id: 'e6', source_id: 'f2_p1', target_id: 'f2_c2', edge_type: 'parent_child' as const },
    ];

    render(<BirdseyeMapCanvas people={people} edges={edges} />);

    const bus1 = screen.getByTestId('map-edge-bus-couple-f1_p1-f1_p2');
    const bus2 = screen.getByTestId('map-edge-bus-couple-f2_p1-f2_p2');

    expect(bus1).toBeInTheDocument();
    expect(bus2).toBeInTheDocument();

    const path1 = bus1.querySelectorAll('path')[1].getAttribute('d') || '';
    const path2 = bus2.querySelectorAll('path')[1].getAttribute('d') || '';

    // Match M x y L x y
    const match1 = path1.match(/M\s+[-\d.]+\s+([-\d.]+)\s+L\s+[-\d.]+\s+([-\d.]+)/);
    const match2 = path2.match(/M\s+[-\d.]+\s+([-\d.]+)\s+L\s+[-\d.]+\s+([-\d.]+)/);

    expect(match1).not.toBeNull();
    expect(match2).not.toBeNull();

    const y1 = parseFloat(match1![1]);
    const y2 = parseFloat(match2![1]);

    // One bus should be at parentY + 90 + 70 - 16 = 234, the other at parentY + 90 + 70 + 16 = 266
    expect(Math.abs(y1 - y2)).toBe(32);
  });

  it('renders SVG jump arc bridge (A 6 6 ...) when a vertical line crosses a horizontal line', () => {
    // Tier 0: Single parent p1 and couple p2+p3
    // Tier 1: Couple c_mid_1 + c_mid_2 (children of p2+p3)
    // Tier 2: Children of c_mid_1+c_mid_2: gc1 (left), gc2 (middle), gc3 (right)
    // c_deep (child of p1 from Tier 0) is married to middle child gc2 in Tier 2
    // The vertical child ingress line from p1 (Tier 0) down to c_deep (Tier 2)
    // crosses c_mid_1+c_mid_2's horizontal bus spanning from gc1 to gc3
    const people: MapPerson[] = [
      makePerson('p1', 'Parent1', 'A', '1900'),
      makePerson('p2', 'Parent2', 'B', '1902'),
      makePerson('p3', 'Parent3', 'B', '1904'),
      makePerson('c_mid_1', 'ChildMid1', 'B', '1925'),
      makePerson('c_mid_2', 'ChildMid2', 'B', '1927'),
      makePerson('gc1', 'GrandChild1', 'B', '1940'),
      makePerson('gc2', 'GrandChild2', 'B', '1950'),
      makePerson('gc3', 'GrandChild3', 'B', '1960'),
      makePerson('c_deep', 'ChildDeep', 'A', '1955'),
    ];
    const edges = [
      { id: 'e1', source_id: 'p2', target_id: 'p3', edge_type: 'partner' as const },
      { id: 'e2', source_id: 'p2', target_id: 'c_mid_1', edge_type: 'parent_child' as const },
      { id: 'e3', source_id: 'p3', target_id: 'c_mid_1', edge_type: 'parent_child' as const },
      { id: 'e4', source_id: 'c_mid_1', target_id: 'c_mid_2', edge_type: 'partner' as const },
      { id: 'e5', source_id: 'c_mid_1', target_id: 'gc1', edge_type: 'parent_child' as const },
      { id: 'e6', source_id: 'c_mid_1', target_id: 'gc2', edge_type: 'parent_child' as const },
      { id: 'e7', source_id: 'c_mid_1', target_id: 'gc3', edge_type: 'parent_child' as const },
      { id: 'e8', source_id: 'p1', target_id: 'c_deep', edge_type: 'parent_child' as const },
      { id: 'e9', source_id: 'gc2', target_id: 'c_deep', edge_type: 'partner' as const },
    ];

    const { container } = render(<BirdseyeMapCanvas people={people} edges={edges} />);

    // Find all paths in SVG
    const allPaths = Array.from(container.querySelectorAll('svg g g path'));
    const jumpArcPaths = allPaths.filter((p) => {
      const d = p.getAttribute('d') || '';
      return d.includes('A 6 6 0 0 0');
    });

    expect(jumpArcPaths.length).toBeGreaterThan(0);
    expect(jumpArcPaths[0].getAttribute('d')).toContain('A 6 6 0 0 0');
    // Ensure arc jumps from yCross - 6 (458) to yCross + 6 (470)
    expect(jumpArcPaths[0].getAttribute('d')).toMatch(/L\s+439\s+458\s+A\s+6\s+6\s+0\s+0\s+0\s+439\s+470/);
  });

  it('applies server positions overrides to node coordinates', () => {
    const serverPositions = {
      '1': { x: 500, y: 350 },
    };

    render(
      <BirdseyeMapCanvas
        people={mockPeople}
        serverPositions={serverPositions}
      />
    );

    const getPos = (id: string) => {
      const el = screen.getByTestId(`map-node-${id}`);
      const match = el.getAttribute('transform')?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
      if (!match) throw new Error('No transform');
      return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
    };

    const pos1 = getPos('1');
    expect(pos1.x).toBe(500);
    expect(pos1.y).toBe(350);
  });

  it('dragging a card updates node position and fires onSavePositions on mouse up', () => {
    const onSavePositions = vi.fn();

    const { container } = render(
      <BirdseyeMapCanvas
        people={mockPeople}
        onSavePositions={onSavePositions}
      />
    );

    const getPos = (id: string) => {
      const el = screen.getByTestId(`map-node-${id}`);
      const match = el.getAttribute('transform')?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
      if (!match) throw new Error('No transform');
      return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
    };

    const initialPos1 = getPos('1');
    const node1 = screen.getByTestId('map-node-1');
    const svg = container.querySelector('svg')!;

    // Mouse down on node 1
    fireEvent.mouseDown(node1, { clientX: 100, clientY: 100, button: 0 });

    // Drag by +50, +30
    fireEvent.mouseMove(svg, { clientX: 150, clientY: 130 });

    // Node position should update live
    const movedPos1 = getPos('1');
    expect(movedPos1.x).toBe(initialPos1.x + 50);
    expect(movedPos1.y).toBe(initialPos1.y + 30);

    // Mouse up to save
    fireEvent.mouseUp(svg);

    expect(onSavePositions).toHaveBeenCalledWith(
      expect.objectContaining({
        '1': { x: initialPos1.x + 50, y: initialPos1.y + 30 },
      })
    );
  });

  it('clicking Reset Auto-Layout clears overrides and calls onResetPositions', () => {
    const onResetPositions = vi.fn();
    const serverPositions = {
      '1': { x: 500, y: 350 },
    };

    render(
      <BirdseyeMapCanvas
        people={mockPeople}
        serverPositions={serverPositions}
        onResetPositions={onResetPositions}
      />
    );

    const getPos = (id: string) => {
      const el = screen.getByTestId(`map-node-${id}`);
      const match = el.getAttribute('transform')?.match(/translate\(([-\d.]+),\s*([-\d.]+)\)/);
      if (!match) throw new Error('No transform');
      return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
    };

    expect(getPos('1')).toEqual({ x: 500, y: 350 });

    const resetLayoutBtn = screen.getByRole('button', { name: /Reset Auto-Layout/i });
    fireEvent.click(resetLayoutBtn);

    expect(onResetPositions).toHaveBeenCalledTimes(1);
    expect(getPos('1').x).not.toBe(500);
    expect(getPos('1').y).not.toBe(350);
  });

  it('does not allow dragging cards when canEdit is false', () => {
    const onSavePositions = vi.fn();

    const { container } = render(
      <BirdseyeMapCanvas
        people={mockPeople}
        canEdit={false}
        onSavePositions={onSavePositions}
      />
    );

    const node1 = screen.getByTestId('map-node-1');
    const svg = container.querySelector('svg')!;

    fireEvent.mouseDown(node1, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.mouseMove(svg, { clientX: 200, clientY: 200 });
    fireEvent.mouseUp(svg);

    expect(onSavePositions).not.toHaveBeenCalled();
  });

  it('clicking directly on person name text navigates to focus view', () => {
    const onSelectPerson = vi.fn();

    render(
      <BirdseyeMapCanvas
        people={mockPeople}
        onSelectPerson={onSelectPerson}
      />
    );

    // Click specifically on the name text
    const nameText = screen.getByTestId('map-node-name-1');
    fireEvent.click(nameText);

    expect(onSelectPerson).toHaveBeenCalledWith('1');
  });

  it('dragging a node does not trigger navigation to focus view', () => {
    const onSelectPerson = vi.fn();
    const onSavePositions = vi.fn();

    const { container } = render(
      <BirdseyeMapCanvas
        people={mockPeople}
        onSelectPerson={onSelectPerson}
        onSavePositions={onSavePositions}
      />
    );

    const node1 = screen.getByTestId('map-node-1');
    const svg = container.querySelector('svg')!;

    // Drag node 1
    fireEvent.mouseDown(node1, { clientX: 100, clientY: 100, button: 0 });
    fireEvent.mouseMove(svg, { clientX: 150, clientY: 150 });
    fireEvent.mouseUp(svg);

    // Click event following mouseUp on node
    fireEvent.click(node1);

    expect(onSavePositions).toHaveBeenCalled();
    expect(onSelectPerson).not.toHaveBeenCalled();
  });

  it('renders SVG clipPath and image elements when avatar_url is present on nodes and in toolbar', () => {
    const peopleWithAvatar: MapPerson[] = [
      {
        ...mockPeople[0],
        avatar_url: 'data:image/jpeg;base64,mapavatar1',
      },
      mockPeople[1],
    ];

    const { container } = render(
      <BirdseyeMapCanvas people={peopleWithAvatar} />
    );

    // Node 1 has avatar: should have clipPath and image element
    const clipPath1 = container.querySelector('#avatar-clip-1');
    expect(clipPath1).toBeInTheDocument();

    const node1Image = container.querySelector('image[href="data:image/jpeg;base64,mapavatar1"]');
    expect(node1Image).toBeInTheDocument();
    expect(node1Image?.getAttribute('clip-path')).toBe('url(#avatar-clip-1)');

    // Node 2 has no avatar: should render initials
    expect(screen.getByText('AB')).toBeInTheDocument();

    // Select node 1: toolbar should render image
    const node1 = screen.getByTestId('map-node-1');
    fireEvent.click(node1);

    const toolbar = screen.getByTestId('map-selected-toolbar');
    const toolbarImg = within(toolbar).getByRole('img', { name: 'Arthur Miller' });
    expect(toolbarImg).toBeInTheDocument();
    expect(toolbarImg).toHaveAttribute('src', 'data:image/jpeg;base64,mapavatar1');
  });

  describe('Multi-Touch Canvas Gestures & Guidance Toast', () => {
    it('updates canvas pan and zoom proportionally on 2-finger touchstart and touchmove', () => {
      render(<BirdseyeMapCanvas people={mockPeople} />);

      const svg = screen.getByLabelText('Family tree pedigree chart');
      const mainGroup = svg.querySelector('g')!;

      // Initial transform
      expect(mainGroup.getAttribute('transform')).toBe('translate(0, 0) scale(1)');

      // 2 fingers down: (100, 100) and (200, 100) -> centroid (150, 100), distance 100
      fireEvent.touchStart(svg, {
        touches: [
          { clientX: 100, clientY: 100 },
          { clientX: 200, clientY: 100 },
        ],
      });

      // 2 fingers move (pinch zoom x2, centered at 150, 100): (50, 100) and (250, 100) -> centroid (150, 100), distance 200
      const moveEvent = createEvent.touchMove(svg, {
        touches: [
          { clientX: 50, clientY: 100 },
          { clientX: 250, clientY: 100 },
        ],
      });
      const preventDefaultSpy = vi.spyOn(moveEvent, 'preventDefault');
      fireEvent(svg, moveEvent);

      // Verify preventDefault was called on 2-finger move
      expect(preventDefaultSpy).toHaveBeenCalled();

      // Transform should be translate(-150, -100) scale(2)
      expect(mainGroup.getAttribute('transform')).toBe('translate(-150, -100) scale(2)');

      // 2 fingers move further with pan: (100, 150) and (300, 150) -> centroid (200, 150), distance 200
      fireEvent.touchMove(svg, {
        touches: [
          { clientX: 100, clientY: 150 },
          { clientX: 300, clientY: 150 },
        ],
      });

      // New pan: 200 - 150 * 2 = -100, 150 - 100 * 2 = -50
      expect(mainGroup.getAttribute('transform')).toBe('translate(-100, -50) scale(2)');

      // Touch end
      fireEvent.touchEnd(svg, { touches: [] });
    });

    it('displays 1-finger guidance toast on canvas background movement >10px and auto-hides after 1.5s', () => {
      vi.useFakeTimers();

      render(<BirdseyeMapCanvas people={mockPeople} />);
      const svg = screen.getByLabelText('Family tree pedigree chart');

      // 1 finger down at (100, 100)
      fireEvent.touchStart(svg, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      // Move <= 10px (e.g. 5px) -> toast should NOT be displayed
      const smallMoveEvent = createEvent.touchMove(svg, {
        touches: [{ clientX: 105, clientY: 100 }],
      });
      const smallSpy = vi.spyOn(smallMoveEvent, 'preventDefault');
      fireEvent(svg, smallMoveEvent);
      expect(screen.queryByText(/Use two fingers to pan and zoom the map/i)).not.toBeInTheDocument();
      // 1-finger move must NOT preventDefault (allowing normal page scroll)
      expect(smallSpy).not.toHaveBeenCalled();

      // Move > 10px (e.g. +20px) -> toast should appear
      const largeMoveEvent = createEvent.touchMove(svg, {
        touches: [{ clientX: 120, clientY: 100 }],
      });
      const largeSpy = vi.spyOn(largeMoveEvent, 'preventDefault');
      fireEvent(svg, largeMoveEvent);
      expect(screen.getByText(/Use two fingers to pan and zoom the map/i)).toBeInTheDocument();
      expect(largeSpy).not.toHaveBeenCalled();

      // Fast forward time by 1500ms
      act(() => {
        vi.advanceTimersByTime(1500);
      });

      // Toast should disappear
      expect(screen.queryByText(/Use two fingers to pan and zoom the map/i)).not.toBeInTheDocument();

      vi.useRealTimers();
    });
  });

  describe('Node Touch Drag-and-Drop & Gestures', () => {
    it('initiates drag mode after 250ms long-press with haptic vibration and visual lifted state', () => {
      vi.useFakeTimers();
      const vibrateMock = vi.fn();
      navigator.vibrate = vibrateMock;

      const onSavePositions = vi.fn();
      render(
        <BirdseyeMapCanvas
          people={mockPeople}
          onSavePositions={onSavePositions}
        />
      );

      const node1 = screen.getByTestId('map-node-1');
      const rect1 = node1.querySelector('rect')!;

      // Initial state: not lifted
      expect(rect1.className.baseVal || rect1.getAttribute('class')).toContain('stroke-slate-300');
      expect(rect1.className.baseVal || rect1.getAttribute('class')).not.toContain('drop-shadow-xl');

      // Touch start on node 1
      fireEvent.touchStart(node1, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      // Advance time less than 250ms (e.g. 200ms)
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(vibrateMock).not.toHaveBeenCalled();
      expect(rect1.className.baseVal || rect1.getAttribute('class')).not.toContain('drop-shadow-xl');

      // Advance time to 250ms
      act(() => {
        vi.advanceTimersByTime(50);
      });

      expect(vibrateMock).toHaveBeenCalledWith(40);
      expect(rect1.className.baseVal || rect1.getAttribute('class')).toContain('stroke-amber-400');
      expect(rect1.className.baseVal || rect1.getAttribute('class')).toContain('drop-shadow-xl');

      // Subsequent touch move repositions node and prevents default
      const moveEvent = createEvent.touchMove(node1, {
        touches: [{ clientX: 160, clientY: 140 }],
      });
      const preventDefaultSpy = vi.spyOn(moveEvent, 'preventDefault');
      fireEvent(node1, moveEvent);

      expect(preventDefaultSpy).toHaveBeenCalled();

      // Touchend saves positions
      fireEvent.touchEnd(node1, {
        touches: [],
        changedTouches: [{ clientX: 160, clientY: 140 }],
      });

      expect(onSavePositions).toHaveBeenCalledTimes(1);

      vi.useRealTimers();
    });

    it('selects node on short tap (<250ms, <8px movement) without dragging or saving', () => {
      vi.useFakeTimers();
      const onSavePositions = vi.fn();
      render(
        <BirdseyeMapCanvas
          people={mockPeople}
          onSavePositions={onSavePositions}
        />
      );

      const node1 = screen.getByTestId('map-node-1');

      // Touch start on node 1
      fireEvent.touchStart(node1, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      // Advance 100ms
      act(() => {
        vi.advanceTimersByTime(100);
      });

      // Small move < 8px
      fireEvent.touchMove(node1, {
        touches: [{ clientX: 102, clientY: 103 }],
      });

      // Touch end at 150ms
      fireEvent.touchEnd(node1, {
        touches: [],
        changedTouches: [{ clientX: 102, clientY: 103 }],
      });

      // Advance past 250ms to ensure timer doesn't fire later
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // Person is selected (floating toolbar appears)
      expect(screen.getByTestId('map-selected-toolbar')).toBeInTheDocument();
      expect(within(screen.getByTestId('map-selected-toolbar')).getByText('Arthur Miller')).toBeInTheDocument();
      expect(onSavePositions).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('cancels long-press timer when finger moves >8px before 250ms and does not prevent default', () => {
      vi.useFakeTimers();
      const vibrateMock = vi.fn();
      navigator.vibrate = vibrateMock;
      const onSavePositions = vi.fn();

      render(
        <BirdseyeMapCanvas
          people={mockPeople}
          onSavePositions={onSavePositions}
        />
      );

      const node1 = screen.getByTestId('map-node-1');
      const rect1 = node1.querySelector('rect')!;

      // Touch start
      fireEvent.touchStart(node1, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      // Move > 8px (e.g. 15px) at 100ms
      act(() => {
        vi.advanceTimersByTime(100);
      });

      const moveEvent = createEvent.touchMove(node1, {
        touches: [{ clientX: 115, clientY: 100 }],
      });
      const preventDefaultSpy = vi.spyOn(moveEvent, 'preventDefault');
      fireEvent(node1, moveEvent);

      // Should not prevent default (allows scrolling)
      expect(preventDefaultSpy).not.toHaveBeenCalled();

      // Advance past 250ms
      act(() => {
        vi.advanceTimersByTime(200);
      });

      // Should not have vibrated or entered lifted state
      expect(vibrateMock).not.toHaveBeenCalled();
      expect(rect1.className.baseVal || rect1.getAttribute('class')).not.toContain('drop-shadow-xl');

      // Touch end
      fireEvent.touchEnd(node1, {
        touches: [],
        changedTouches: [{ clientX: 115, clientY: 100 }],
      });

      expect(onSavePositions).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('disables long-press drag when canEdit is false', () => {
      vi.useFakeTimers();
      const vibrateMock = vi.fn();
      navigator.vibrate = vibrateMock;
      const onSavePositions = vi.fn();

      render(
        <BirdseyeMapCanvas
          people={mockPeople}
          canEdit={false}
          onSavePositions={onSavePositions}
        />
      );

      const node1 = screen.getByTestId('map-node-1');
      const rect1 = node1.querySelector('rect')!;

      fireEvent.touchStart(node1, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      act(() => {
        vi.advanceTimersByTime(300);
      });

      expect(vibrateMock).not.toHaveBeenCalled();
      expect(rect1.className.baseVal || rect1.getAttribute('class')).not.toContain('drop-shadow-xl');

      fireEvent.touchEnd(node1, {
        touches: [],
        changedTouches: [{ clientX: 100, clientY: 100 }],
      });

      expect(onSavePositions).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('prevents opening selection toolbar immediately after a drag drop via justDraggedRef guard', () => {
      vi.useFakeTimers();
      render(<BirdseyeMapCanvas people={mockPeople} />);

      const node1 = screen.getByTestId('map-node-1');

      // Long press to lift
      fireEvent.touchStart(node1, {
        touches: [{ clientX: 100, clientY: 100 }],
      });
      act(() => {
        vi.advanceTimersByTime(250);
      });

      // Move
      fireEvent.touchMove(node1, {
        touches: [{ clientX: 150, clientY: 150 }],
      });

      // Touch end
      fireEvent.touchEnd(node1, {
        touches: [],
        changedTouches: [{ clientX: 150, clientY: 150 }],
      });

      // Synthetic click immediately after touchEnd (common in mobile browsers)
      fireEvent.click(node1);

      // Selection toolbar should NOT open because justDraggedRef guard is active
      expect(screen.queryByTestId('map-selected-toolbar')).not.toBeInTheDocument();

      // After 200ms guard expires, click works again
      act(() => {
        vi.advanceTimersByTime(200);
      });

      fireEvent.click(node1);
      expect(screen.getByTestId('map-selected-toolbar')).toBeInTheDocument();

      vi.useRealTimers();
    });

    it('handles touchCancel gracefully after drag, saving positions and clearing lifted state', () => {
      vi.useFakeTimers();
      const onSavePositions = vi.fn();
      render(
        <BirdseyeMapCanvas
          people={mockPeople}
          onSavePositions={onSavePositions}
        />
      );

      const node1 = screen.getByTestId('map-node-1');
      const rect1 = node1.querySelector('rect')!;

      fireEvent.touchStart(node1, {
        touches: [{ clientX: 100, clientY: 100 }],
      });
      act(() => {
        vi.advanceTimersByTime(250);
      });

      fireEvent.touchMove(node1, {
        touches: [{ clientX: 150, clientY: 150 }],
      });

      expect(rect1.className.baseVal || rect1.getAttribute('class')).toContain('drop-shadow-xl');

      fireEvent.touchCancel(node1);

      expect(onSavePositions).toHaveBeenCalledTimes(1);
      expect(rect1.className.baseVal || rect1.getAttribute('class')).not.toContain('drop-shadow-xl');

      vi.useRealTimers();
    });
  });

  describe('Responsive Map Viewport, Fullscreen Mode & Mobile Action Sheet', () => {
    it('renders responsive container height classes by default', () => {
      render(<BirdseyeMapCanvas people={mockPeople} />);

      const mapContainer = screen.getByRole('region', { name: /Family Tree Overview Map/i });
      expect(mapContainer).toHaveClass('h-[60vh]', 'sm:h-[70vh]', 'min-h-[440px]', 'max-h-[750px]');
    });

    it('toggles fullscreen mode expanding container to fixed fullscreen classes and back', () => {
      render(<BirdseyeMapCanvas people={mockPeople} />);

      const mapContainer = screen.getByRole('region', { name: /Family Tree Overview Map/i });
      const fullscreenBtn = screen.getByRole('button', { name: /Enter Fullscreen|Fullscreen/i });
      expect(fullscreenBtn).toBeInTheDocument();

      // Enter fullscreen
      fireEvent.click(fullscreenBtn);
      expect(mapContainer).toHaveClass('fixed', 'inset-0', 'z-50', 'rounded-none', 'w-screen', 'h-screen');

      // Exit fullscreen
      const exitBtn = screen.getByRole('button', { name: /Exit Fullscreen/i });
      expect(exitBtn).toBeInTheDocument();
      fireEvent.click(exitBtn);

      expect(mapContainer).not.toHaveClass('fixed', 'z-50', 'w-screen', 'h-screen');
      expect(mapContainer).toHaveClass('h-[60vh]', 'sm:h-[70vh]');
    });

    it('exits fullscreen mode when Escape key is pressed', () => {
      render(<BirdseyeMapCanvas people={mockPeople} />);

      const mapContainer = screen.getByRole('region', { name: /Family Tree Overview Map/i });
      const fullscreenBtn = screen.getByRole('button', { name: /Enter Fullscreen|Fullscreen/i });

      // Enter fullscreen
      fireEvent.click(fullscreenBtn);
      expect(mapContainer).toHaveClass('fixed', 'inset-0', 'z-50');

      // Press Escape
      fireEvent.keyDown(window, { key: 'Escape' });

      // Fullscreen exited
      expect(mapContainer).not.toHaveClass('fixed', 'z-50');
      expect(mapContainer).toHaveClass('h-[60vh]', 'sm:h-[70vh]');
    });

    it('renders mobile-responsive selected person bottom action sheet with >=44px touch targets', () => {
      const onSelectPerson = vi.fn();
      const onEditPerson = vi.fn();

      render(
        <BirdseyeMapCanvas
          people={mockPeople}
          onSelectPerson={onSelectPerson}
          onEditPerson={onEditPerson}
        />
      );

      // Select node 1
      const node1 = screen.getByTestId('map-node-1');
      fireEvent.click(node1);

      const toolbar = screen.getByTestId('map-selected-toolbar');
      expect(toolbar).toBeInTheDocument();

      // Has mobile bottom-dock and desktop floating classes
      expect(toolbar).toHaveClass('fixed', 'sm:absolute', 'bottom-0', 'sm:bottom-6', 'left-0', 'right-0', 'sm:left-1/2', 'rounded-t-2xl', 'sm:rounded-2xl');

      // Action buttons have >=44px touch target ergonomics
      const editBtn = within(toolbar).getByRole('button', { name: /Edit Details/i });
      const focusBtn = within(toolbar).getByRole('button', { name: /Focus View/i });
      const closeBtn = within(toolbar).getByRole('button', { name: /Close selection bar|Close/i });

      expect(editBtn).toHaveClass('min-h-[44px]');
      expect(focusBtn).toHaveClass('min-h-[44px]');
      expect(closeBtn).toHaveClass('min-w-[44px]', 'min-h-[44px]');

      // Buttons are functional
      fireEvent.click(editBtn);
      expect(onEditPerson).toHaveBeenCalledWith(expect.objectContaining({ id: '1' }));

      fireEvent.click(focusBtn);
      expect(onSelectPerson).toHaveBeenCalledWith('1');

      fireEvent.click(closeBtn);
      expect(screen.queryByTestId('map-selected-toolbar')).not.toBeInTheDocument();
    });

    it('collapses control bar legend and allows mobile legend disclosure toggle', () => {
      render(<BirdseyeMapCanvas people={mockPeople} />);

      // On mobile disclosure toggle button is available
      const legendToggle = screen.getByRole('button', { name: /Toggle Map Legend|Map Legend/i });
      expect(legendToggle).toBeInTheDocument();

      // Clicking legend toggle reveals legend details
      fireEvent.click(legendToggle);
      expect(screen.getByTestId('mobile-map-legend')).toBeInTheDocument();
      expect(within(screen.getByTestId('mobile-map-legend')).getByText('Partner')).toBeInTheDocument();
      expect(within(screen.getByTestId('mobile-map-legend')).getByText('Parent → Child')).toBeInTheDocument();
    });
  });

  describe('Android Chrome & Mobile Touch Drag Stability', () => {
    it('prevents default on contextmenu event on canvas and nodes to suppress Android context menu and text drag', () => {
      render(<BirdseyeMapCanvas people={mockPeople} />);

      const svg = screen.getByLabelText('Family tree pedigree chart');
      const node1 = screen.getByTestId('map-node-1');

      const svgContextEvent = createEvent.contextMenu(svg);
      const svgPreventSpy = vi.spyOn(svgContextEvent, 'preventDefault');
      fireEvent(svg, svgContextEvent);
      expect(svgPreventSpy).toHaveBeenCalled();

      const nodeContextEvent = createEvent.contextMenu(node1);
      const nodePreventSpy = vi.spyOn(nodeContextEvent, 'preventDefault');
      fireEvent(node1, nodeContextEvent);
      expect(nodePreventSpy).toHaveBeenCalled();
    });

    it('enforces touch-none, select-none, and touchAction style on interactive SVG canvas and draggable nodes', () => {
      render(<BirdseyeMapCanvas people={mockPeople} />);

      const svg = screen.getByLabelText('Family tree pedigree chart');
      const node1 = screen.getByTestId('map-node-1');

      expect(svg).toHaveClass('touch-none', 'select-none');
      expect(node1).toHaveClass('touch-none', 'select-none');
    });

    it('does not throw or crash when ref is cleared during rapid touch move / cancel cycles', () => {
      vi.useFakeTimers();
      const onSavePositions = vi.fn();
      render(
        <BirdseyeMapCanvas
          people={mockPeople}
          onSavePositions={onSavePositions}
        />
      );

      const node1 = screen.getByTestId('map-node-1');

      // Touch start
      fireEvent.touchStart(node1, {
        touches: [{ clientX: 100, clientY: 100 }],
      });

      // Long press hold
      act(() => {
        vi.advanceTimersByTime(250);
      });

      // Move while lifted
      expect(() => {
        fireEvent.touchMove(node1, {
          touches: [{ clientX: 180, clientY: 160 }],
        });
      }).not.toThrow();

      // Sudden touch cancel
      expect(() => {
        fireEvent.touchCancel(node1);
      }).not.toThrow();

      vi.useRealTimers();
    });
  });
});





