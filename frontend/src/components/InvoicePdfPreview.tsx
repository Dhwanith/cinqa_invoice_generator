import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getActualInvoicePdfPreviewUrl, getInvoicePdfBlobUrl, downloadInvoicePdf } from "@/services/invoicePdf";
import type { Invoice } from "@/types/invoice";

interface Props {
  invoice: Invoice | null;
  onClose: () => void;
}

export default function InvoicePdfPreview({ invoice, onClose }: Props) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!invoice) {
      setPdfUrl(null);
      return;
    }

    const actualPdfUrl = getActualInvoicePdfPreviewUrl(invoice);
    if (actualPdfUrl) {
      setPdfUrl(actualPdfUrl);
      return;
    }

    const url = getInvoicePdfBlobUrl(invoice);
    setPdfUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [invoice]);

  if (!invoice) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="bg-card rounded-2xl border border-border shadow-elevated w-full max-w-4xl h-[85vh] flex flex-col overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                <Eye size={16} className="text-primary" />
              </div>
              <div>
                <h3 className="text-sm font-bold">{invoice.invoiceNo}</h3>
                <p className="text-xs text-muted-foreground">{invoice.clientName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8 gap-1.5"
                onClick={() => downloadInvoicePdf(invoice)}
              >
                <Download size={14} /> Download PDF
              </Button>
              <button
                onClick={onClose}
                className="p-2 rounded-xl hover:bg-muted transition-colors"
              >
                <X size={18} className="text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* PDF Embed */}
          <div className="flex-1 bg-muted/30 p-4 overflow-hidden">
            {pdfUrl ? (
              <iframe
                src={pdfUrl}
                className="w-full h-full rounded-xl border border-border bg-white"
                title="Invoice PDF Preview"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                Generating PDF…
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
