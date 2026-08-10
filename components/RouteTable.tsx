"use client";

import {
  useTable,
  tableFeatures,
  rowSortingFeature,
  createSortedRowModel,
  sortFn_alphanumeric,
  sortFn_basic,
  createColumnHelper,
  flexRender,
  type SortingState,
} from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, MapPin } from "lucide-react";
import type { TableRow } from "@/lib/types";
import { formatDateTime, formatDuration, formatTime } from "@/lib/format";

// @tanstack/react-table v9 requires features to be registered explicitly
// (see the library's own migrate-v8-to-v9 skill) -- this table only needs
// client-side column sorting, so that's the only feature/row-model slot
// registered here alongside the built-in sort comparators the columns use
// (alphanumeric for the string columns, basic for the numeric one).
const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns: { alphanumeric: sortFn_alphanumeric, basic: sortFn_basic },
});

interface RouteTableProps {
  rows: TableRow[];
  selectedIndex: number | null;
  onSelectRow: (index: number | null) => void;
  // Whether every row falls on the same calendar day -- the page's own
  // date-range badge already shows the date in that case, so Arrived/
  // Departed can show just the time instead of repeating it per row.
  singleDay: boolean;
}

const columnHelper = createColumnHelper<typeof features, TableRow>();

// Column widths as percentages so the table stays a fixed layout (see
// `table-fixed` below) and truncates overflowing text instead of
// stretching wider than the map above it — same approach as the
// scorecard app's transaction table.
const COLUMN_WIDTHS: Record<string, string> = {
  place: "31%",
  arrival: "27%",
  departure: "27%",
  durationMinutes: "15%",
};

export default function RouteTable({
  rows,
  selectedIndex,
  onSelectRow,
  singleDay,
}: RouteTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const columns = useMemo(
    () =>
      columnHelper.columns([
        columnHelper.accessor("place", {
          header: "Place",
          sortFn: "alphanumeric",
          cell: (info) => (
            <span className="font-medium text-text">{info.getValue()}</span>
          ),
        }),
        columnHelper.accessor("arrival", {
          header: "Arrived",
          sortFn: "alphanumeric",
          // Unknown means this stop already covered the very start of the
          // queried range -- there's no ping showing them actually
          // arriving, just where the data happens to begin.
          cell: (info) =>
            !info.row.original.arrivalKnown ? (
              <span className="text-faint">—</span>
            ) : singleDay ? (
              formatTime(info.getValue())
            ) : (
              formatDateTime(info.getValue())
            ),
        }),
        columnHelper.accessor("departure", {
          header: "Departed",
          sortFn: "alphanumeric",
          // Unknown means this stop still covers the very end of the
          // queried range -- there's no ping showing them actually leaving.
          cell: (info) =>
            !info.row.original.departureKnown ? (
              <span className="text-faint">—</span>
            ) : singleDay ? (
              formatTime(info.getValue())
            ) : (
              formatDateTime(info.getValue())
            ),
        }),
        columnHelper.accessor("durationMinutes", {
          header: "Duration",
          sortFn: "basic",
          cell: (info) => (
            <span className="inline-flex rounded-full bg-surface-recessed px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-muted">
              {formatDuration(info.getValue())}
            </span>
          ),
        }),
      ]),
    [singleDay]
  );

  const table = useTable({
    features,
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
  });

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 bg-surface p-8 text-center text-sm text-faint">
        <MapPin size={20} className="text-faint" />
        No stops to show for this range.
      </div>
    );
  }

  return (
    <div className="bg-surface">
      <table className="w-full table-fixed text-[13px]">
        <thead className="bg-surface-recessed text-left">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    style={{ width: COLUMN_WIDTHS[header.column.id] }}
                    className="cursor-pointer select-none overflow-hidden text-ellipsis whitespace-nowrap px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted"
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span className="inline-flex items-center gap-1">
                      {flexRender(
                        header.column.columnDef.header,
                        header.getContext()
                      )}
                      {sorted === "asc" && <ArrowUp size={12} />}
                      {sorted === "desc" && <ArrowDown size={12} />}
                    </span>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row) => {
            const stopIndex = row.original.index - 1;
            const isSelected = selectedIndex === stopIndex;
            return (
              <tr
                key={row.id}
                onClick={() =>
                  onSelectRow(isSelected ? null : stopIndex)
                }
                className={`cursor-pointer border-t border-border-subtle transition hover:bg-accent/5 ${
                  isSelected ? "bg-accent/10" : ""
                }`}
              >
                {row.getAllCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="overflow-hidden text-ellipsis whitespace-nowrap px-2 py-2 text-muted"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
