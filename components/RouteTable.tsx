"use client";

import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  createColumnHelper,
  flexRender,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import { ArrowDown, ArrowUp, MapPin } from "lucide-react";
import type { TableRow } from "@/lib/types";
import { formatDateTime, formatDuration } from "@/lib/format";

interface RouteTableProps {
  rows: TableRow[];
  selectedIndex: number | null;
  onSelectRow: (index: number | null) => void;
}

const columnHelper = createColumnHelper<TableRow>();

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

const columns = [
  columnHelper.accessor("place", {
    header: "Place",
    cell: (info) => (
      <span className="font-medium text-text">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor("arrival", {
    header: "Arrived",
    // Unknown means this stop already covered the very start of the
    // queried range -- there's no ping showing them actually arriving,
    // just where the data happens to begin.
    cell: (info) =>
      info.row.original.arrivalKnown ? (
        formatDateTime(info.getValue())
      ) : (
        <span className="text-faint">—</span>
      ),
  }),
  columnHelper.accessor("departure", {
    header: "Departed",
    // Unknown means this stop still covers the very end of the queried
    // range -- there's no ping showing them actually leaving.
    cell: (info) =>
      info.row.original.departureKnown ? (
        formatDateTime(info.getValue())
      ) : (
        <span className="text-faint">—</span>
      ),
  }),
  columnHelper.accessor("durationMinutes", {
    header: "Duration",
    cell: (info) => (
      <span className="inline-flex rounded-full bg-surface-recessed px-2 py-0.5 font-mono text-[11px] font-medium tabular-nums text-muted">
        {formatDuration(info.getValue())}
      </span>
    ),
  }),
];

export default function RouteTable({
  rows,
  selectedIndex,
  onSelectRow,
}: RouteTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
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
                {row.getVisibleCells().map((cell) => (
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
