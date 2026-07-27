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
import type { TableRow } from "@/lib/types";

interface RouteTableProps {
  rows: TableRow[];
  selectedIndex: number | null;
  onSelectRow: (index: number | null) => void;
}

const columnHelper = createColumnHelper<TableRow>();

const columns = [
  columnHelper.accessor("place", {
    header: "Place",
    cell: (info) => info.getValue(),
  }),
  columnHelper.accessor("arrival", {
    header: "Arrived",
    cell: (info) => new Date(info.getValue()).toLocaleString(),
  }),
  columnHelper.accessor("departure", {
    header: "Departed",
    cell: (info) => new Date(info.getValue()).toLocaleString(),
  }),
  columnHelper.accessor("durationMinutes", {
    header: "Duration",
    cell: (info) => `${info.getValue()} min`,
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
      <div className="p-4 text-sm text-gray-500">
        No stops to show for this range.
      </div>
    );
  }

  return (
    <div className="overflow-auto rounded-lg border border-gray-200">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 text-left">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="cursor-pointer select-none px-3 py-2 font-medium text-gray-600"
                  onClick={header.column.getToggleSortingHandler()}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                  {{ asc: " ▲", desc: " ▼" }[
                    header.column.getIsSorted() as string
                  ] ?? ""}
                </th>
              ))}
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
                className={`cursor-pointer border-t border-gray-100 hover:bg-blue-50 ${
                  isSelected ? "bg-blue-100" : ""
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2">
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
