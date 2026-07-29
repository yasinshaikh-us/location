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

const columns = [
  columnHelper.accessor("place", {
    header: "Place",
    cell: (info) => (
      <span className="font-medium text-slate-800">{info.getValue()}</span>
    ),
  }),
  columnHelper.accessor("departure", {
    header: "Departed",
    cell: (info) => formatDateTime(info.getValue()),
  }),
  columnHelper.accessor("arrival", {
    header: "Arrived",
    cell: (info) => formatDateTime(info.getValue()),
  }),
  columnHelper.accessor("durationMinutes", {
    header: "Duration",
    cell: (info) => (
      <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
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
      <div className="flex flex-col items-center gap-2 bg-white p-8 text-center text-sm text-slate-400">
        <MapPin size={20} className="text-slate-300" />
        No stops to show for this range.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white">
      <table className="w-full min-w-[560px] text-sm">
        <thead className="bg-slate-50 text-left">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const sorted = header.column.getIsSorted();
                return (
                  <th
                    key={header.id}
                    className="cursor-pointer select-none whitespace-nowrap px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500"
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
                className={`cursor-pointer border-t border-slate-100 transition hover:bg-blue-50/60 ${
                  isSelected ? "bg-blue-50" : ""
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className="whitespace-nowrap px-3 py-2.5 text-slate-600"
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
