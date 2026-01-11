'use client';

import React, { useState, useMemo, useCallback } from 'react';
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  MoreHorizontal,
  Play,
  Pause,
  Copy,
  Trash2,
  Edit,
  Eye,
  ArrowUpDown,
  Settings2,
  Download,
  Filter,
  X,
  Check,
  GripVertical,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type {
  Campaign,
  AdSet,
  Ad,
  DeliveryStatus,
  TableColumn,
  SortConfig,
} from '@/types/metaAds';
import { formatCurrency, formatNumber, formatPercentage, getDeliveryStatusColor, getDeliveryStatusLabel } from '@/types/metaAds';

type DataItem = Campaign | AdSet | Ad;
type ViewLevel = 'campaigns' | 'adsets' | 'ads';

interface AdsDataTableProps {
  campaigns: Campaign[];
  adSets: AdSet[];
  ads: Ad[];
  viewLevel: ViewLevel;
  selectedItems: string[];
  onSelectItems: (ids: string[]) => void;
  onStatusChange: (id: string, status: 'ACTIVE' | 'PAUSED', level: ViewLevel) => void;
  onEdit: (id: string, level: ViewLevel) => void;
  onDuplicate: (id: string, level: ViewLevel) => void;
  onDelete: (id: string, level: ViewLevel) => void;
  onRowClick?: (id: string, level: ViewLevel) => void;
  currency?: string;
}

// Meta Marketing API v24.0 2026 - Table Columns
const DEFAULT_COLUMNS: TableColumn[] = [
  { id: 'name', label: 'Name', accessor: 'name', type: 'text', sortable: true, frozen: true, minWidth: 250 },
  { id: 'delivery', label: 'Delivery', accessor: 'delivery_status', type: 'status', sortable: true, width: 130 },
  { id: 'budget', label: 'Budget', accessor: 'daily_budget', type: 'currency', sortable: true, width: 120 },
  { id: 'spend', label: 'Amount Spent', accessor: 'insights.spend', type: 'currency', sortable: true, width: 130 },
  { id: 'impressions', label: 'Impressions', accessor: 'insights.impressions', type: 'number', sortable: true, width: 120 },
  { id: 'reach', label: 'Reach', accessor: 'insights.reach', type: 'number', sortable: true, width: 100 },
  { id: 'clicks', label: 'Clicks', accessor: 'insights.clicks', type: 'number', sortable: true, width: 90 },
  { id: 'ctr', label: 'CTR', accessor: 'insights.ctr', type: 'percentage', sortable: true, width: 80 },
  { id: 'cpc', label: 'CPC', accessor: 'insights.cpc', type: 'currency', sortable: true, width: 90 },
  { id: 'cpm', label: 'CPM', accessor: 'insights.cpm', type: 'currency', sortable: true, width: 90 },
  // Enhanced Metrics
  { id: 'conversions', label: 'Conversions', accessor: 'insights.conversions', type: 'number', sortable: true, width: 110 },
  { id: 'roas', label: 'ROAS', accessor: 'insights.roas', type: 'number', sortable: true, width: 80 },
  { id: 'frequency', label: 'Frequency', accessor: 'insights.frequency', type: 'number', sortable: true, width: 100 },
  { id: 'ig_visits', label: 'IG Visits', accessor: 'insights.instagram_profile_visits', type: 'number', sortable: true, width: 100 },
];

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, part) => acc?.[part], obj);
}

function DeliveryStatusBadge({ status, itemStatus }: { status?: DeliveryStatus; itemStatus: string }) {
  if (itemStatus === 'PAUSED') {
    return (
      <Badge variant="outline" className="gap-1.5 font-medium text-slate-500 border-slate-300 bg-slate-50">
        <div className="w-2 h-2 rounded-full bg-slate-400" />
        Paused
      </Badge>
    );
  }

  const color = getDeliveryStatusColor(status);
  const label = getDeliveryStatusLabel(status);

  // Map status to appropriate badge styles
  const getBadgeStyles = () => {
    switch (status) {
      case 'delivering':
        return 'bg-teal-500/10 text-teal-700 border-teal-200';
      case 'learning':
        return 'bg-cyan-500/10 text-cyan-700 border-cyan-200';
      case 'learning_limited':
        return 'bg-amber-500/10 text-amber-700 border-amber-200';
      case 'scheduled':
        return 'bg-violet-500/10 text-violet-700 border-violet-200';
      case 'error':
        return 'bg-rose-500/10 text-rose-700 border-rose-200';
      default:
        return 'bg-slate-100 text-slate-600 border-slate-200';
    }
  };

  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", getBadgeStyles())}>
      <div className={cn("w-2 h-2 rounded-full", color)} />
      {label}
    </Badge>
  );
}

export default function AdsDataTable({
  campaigns = [],
  adSets = [],
  ads = [],
  viewLevel,
  selectedItems,
  onSelectItems,
  onStatusChange,
  onEdit,
  onDuplicate,
  onDelete,
  onRowClick,
  currency = 'USD',
}: AdsDataTableProps) {
  const [sortConfig, setSortConfig] = useState<SortConfig | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(
    DEFAULT_COLUMNS.map(c => c.id)
  );
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);

  // Get data based on view level
  const data = useMemo(() => {
    switch (viewLevel) {
      case 'campaigns':
        return campaigns;
      case 'adsets':
        return adSets;
      case 'ads':
        return ads;
      default:
        return [];
    }
  }, [viewLevel, campaigns, adSets, ads]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortConfig) return data;

    return [...data].sort((a, b) => {
      const aValue = getNestedValue(a, sortConfig.field);
      const bValue = getNestedValue(b, sortConfig.field);

      if (aValue === undefined || aValue === null) return 1;
      if (bValue === undefined || bValue === null) return -1;

      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
      }

      const aStr = String(aValue).toLowerCase();
      const bStr = String(bValue).toLowerCase();

      if (sortConfig.direction === 'asc') {
        return aStr.localeCompare(bStr);
      }
      return bStr.localeCompare(aStr);
    });
  }, [data, sortConfig]);

  const handleSort = (columnId: string) => {
    const column = DEFAULT_COLUMNS.find(c => c.id === columnId);
    if (!column?.sortable) return;

    setSortConfig(prev => {
      if (prev?.field === column.accessor) {
        if (prev.direction === 'asc') {
          return { field: column.accessor, direction: 'desc' };
        }
        return null;
      }
      return { field: column.accessor, direction: 'asc' };
    });
  };

  const handleSelectAll = () => {
    if (selectedItems.length === data.length) {
      onSelectItems([]);
    } else {
      onSelectItems(data.map(item => item.id));
    }
  };

  const handleSelectItem = (id: string) => {
    if (selectedItems.includes(id)) {
      onSelectItems(selectedItems.filter(i => i !== id));
    } else {
      onSelectItems([...selectedItems, id]);
    }
  };

  const toggleRowExpand = (id: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const getChildCount = (item: DataItem): number => {
    if (viewLevel === 'campaigns') {
      return adSets.filter(as => as.campaign_id === item.id).length;
    }
    if (viewLevel === 'adsets') {
      return ads.filter(ad => ad.adset_id === item.id).length;
    }
    return 0;
  };

  const renderCellValue = (column: TableColumn, item: DataItem) => {
    const value = getNestedValue(item, column.accessor);

    switch (column.type) {
      case 'currency':
        return value !== undefined ? formatCurrency(value, currency) : '-';
      case 'number':
        return value !== undefined ? formatNumber(value) : '-';
      case 'percentage':
        return value !== undefined ? formatPercentage(value) : '-';
      case 'status':
        return (
          <DeliveryStatusBadge
            status={(item as any).delivery_status}
            itemStatus={(item as any).status}
          />
        );
      case 'date':
        return value ? new Date(value).toLocaleDateString() : '-';
      default:
        return value ?? '-';
    }
  };

  const columns = DEFAULT_COLUMNS.filter(c => visibleColumns.includes(c.id));

  return (
    <div className="border rounded-lg bg-card overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center justify-between p-3 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          {selectedItems.length > 0 && (
            <>
              <span className="text-sm font-medium">
                {selectedItems.length} selected
              </span>
              <div className="h-4 w-px bg-border" />
              <Button variant="ghost" size="sm" className="h-8 gap-1">
                <Play className="w-4 h-4" />
                Activate
              </Button>
              <Button variant="ghost" size="sm" className="h-8 gap-1">
                <Pause className="w-4 h-4" />
                Pause
              </Button>
              <Button variant="ghost" size="sm" className="h-8 gap-1 text-destructive">
                <Trash2 className="w-4 h-4" />
                Delete
              </Button>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 gap-1">
                <Settings2 className="w-4 h-4" />
                Columns
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>Toggle columns</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {DEFAULT_COLUMNS.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={visibleColumns.includes(column.id)}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setVisibleColumns([...visibleColumns, column.id]);
                    } else {
                      setVisibleColumns(visibleColumns.filter(id => id !== column.id));
                    }
                  }}
                >
                  {column.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" size="sm" className="h-8 gap-1">
            <Download className="w-4 h-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="w-10 p-3">
                <Checkbox
                  checked={selectedItems.length === data.length && data.length > 0}
                  onCheckedChange={handleSelectAll}
                />
              </th>
              <th className="w-8 p-3" />
              {columns.map((column) => (
                <th
                  key={column.id}
                  className={cn(
                    "p-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider",
                    column.sortable && "cursor-pointer hover:text-foreground select-none"
                  )}
                  style={{ minWidth: column.minWidth, width: column.width }}
                  onClick={() => handleSort(column.id)}
                >
                  <div className="flex items-center gap-1">
                    {column.label}
                    {column.sortable && (
                      <span className="ml-1">
                        {sortConfig?.field === column.accessor ? (
                          sortConfig.direction === 'asc' ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )
                        ) : (
                          <ArrowUpDown className="w-4 h-4 opacity-30" />
                        )}
                      </span>
                    )}
                  </div>
                </th>
              ))}
              <th className="w-12 p-3" />
            </tr>
          </thead>
          <tbody>
            {sortedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 3} className="p-8 text-center text-muted-foreground">
                  No {viewLevel} found
                </td>
              </tr>
            ) : (
              sortedData.map((item) => {
                const childCount = getChildCount(item);
                const isExpanded = expandedRows.has(item.id);
                const isSelected = selectedItems.includes(item.id);
                const isHovered = hoveredRow === item.id;

                return (
                  <tr
                    key={item.id}
                    className={cn(
                      "border-b transition-colors",
                      isSelected && "bg-primary/5",
                      isHovered && !isSelected && "bg-muted/50"
                    )}
                    onMouseEnter={() => setHoveredRow(item.id)}
                    onMouseLeave={() => setHoveredRow(null)}
                  >
                    <td className="p-3">
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => handleSelectItem(item.id)}
                      />
                    </td>
                    <td className="p-3">
                      {childCount > 0 ? (
                        <button
                          onClick={() => toggleRowExpand(item.id)}
                          className="p-1 hover:bg-muted rounded"
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                      ) : (
                        <div className="w-6" />
                      )}
                    </td>
                    {columns.map((column) => (
                      <td
                        key={column.id}
                        className={cn(
                          "p-3 text-sm",
                          column.id === 'name' && "font-medium cursor-pointer hover:text-primary"
                        )}
                        onClick={() => {
                          if (column.id === 'name' && onRowClick) {
                            onRowClick(item.id, viewLevel);
                          }
                        }}
                      >
                        {column.id === 'name' ? (
                          <div className="flex items-center gap-2">
                            <span className="truncate max-w-[200px]">
                              {(item as any).name}
                            </span>
                            {childCount > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                {childCount}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          renderCellValue(column, item)
                        )}
                      </td>
                    ))}
                    <td className="p-3">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className={cn(
                              "h-8 w-8",
                              !isHovered && "opacity-0"
                            )}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onEdit(item.id, viewLevel)}>
                            <Edit className="w-4 h-4 mr-2" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => onDuplicate(item.id, viewLevel)}>
                            <Copy className="w-4 h-4 mr-2" />
                            Duplicate
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {(item as any).status === 'ACTIVE' ? (
                            <DropdownMenuItem onClick={() => onStatusChange(item.id, 'PAUSED', viewLevel)}>
                              <Pause className="w-4 h-4 mr-2" />
                              Pause
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem onClick={() => onStatusChange(item.id, 'ACTIVE', viewLevel)}>
                              <Play className="w-4 h-4 mr-2" />
                              Activate
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => onDelete(item.id, viewLevel)}
                            className="text-destructive"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between p-3 border-t bg-muted/30">
        <span className="text-sm text-muted-foreground">
          Showing {sortedData.length} {viewLevel}
        </span>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">
            Total Spend: {formatCurrency(
              sortedData.reduce((sum, item) => sum + (getNestedValue(item, 'insights.spend') || 0), 0),
              currency
            )}
          </span>
        </div>
      </div>
    </div>
  );
}
