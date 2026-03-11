// SUNRISE INVOICE API (Google Apps Script)
// As requested: dropdown from `dropdown` sheet, bill data in `Bill_data`, PDFs in provided Drive folder.
const SHEET_ID = '13XsQRZsQyDgqUyw2LkW0Ny24U5vmje25vctq7lVW6PU';
const FOLDER_ID = '1JjgQMEk4J8Ij3u_QqhvmrBCq0UoZt_FN';
const DROPDOWN_SHEET_NAME = 'dropdown';
const ENTRY_SHEET_NAME = 'Bill_data';

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || '';

    if (!action) return jsonResponse({ success: true, message: 'Sunrise invoice API is running.' });
    if (action === 'initial-data') return jsonResponse({ success: true, data: getInitialData() });

    if (action === 'invoice') {
      const invoiceNo = (e.parameter.invoiceNo || '').trim();
      return jsonResponse({ success: true, data: loadInvoiceData(invoiceNo) });
    }

    return jsonResponse({ success: false, error: 'Invalid action.' });
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() });
  }
}

function doPost(e) {
  try {
    const payload = e && e.postData && e.postData.contents ? JSON.parse(e.postData.contents) : {};
    const action = payload.action || (e && e.parameter && e.parameter.action) || '';

    if (!action && payload.invoiceNo && payload.itemsJson) {
      return jsonResponse({ success: true, data: saveInvoice(payload) });
    }

    if (action === 'save-invoice') {
      return jsonResponse({ success: true, data: saveInvoice(payload) });
    }

    return jsonResponse({ success: false, error: 'Invalid action.' });
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() });
  }
}

function jsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function getInitialData() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  // Product dropdown data
  let products = [];
  const dropSheet = ss.getSheetByName(DROPDOWN_SHEET_NAME);
  if (dropSheet && dropSheet.getLastRow() >= 2) {
    products = dropSheet.getRange(2, 1, dropSheet.getLastRow() - 1, 4).getValues();
  }

  // Existing invoice numbers + next invoice number
  let invoices = [];
  let nextInvoiceNo = 'SUN-001';

  const entrySheet = ss.getSheetByName(ENTRY_SHEET_NAME);
  if (entrySheet && entrySheet.getLastRow() >= 2) {
    const rawData = entrySheet.getRange(2, 2, entrySheet.getLastRow() - 1, 1).getValues();

    invoices = rawData
      .flat()
      .filter(String)
      .map(function(v) { return String(v).replace(/^'/, '').trim(); });

    if (invoices.length > 0) {
      const lastInv = invoices[invoices.length - 1];
      const match = lastInv.match(/(\d+)$/);
      if (match) {
        const numberPart = parseInt(match[0], 10);
        const nextNumber = numberPart + 1;
        const paddedNumber = String(nextNumber).padStart(match[0].length, '0');
        nextInvoiceNo = lastInv.replace(match[0], paddedNumber);
      }
    }
  }

  return { products: products, invoices: invoices, nextInvoiceNo: nextInvoiceNo };
}

function loadInvoiceData(invoiceNo) {
  const ss = SpreadsheetApp.openById(SHEET_ID);
  const sheet = ss.getSheetByName(ENTRY_SHEET_NAME);
  if (!sheet) return { found: false, error: 'Sheet not found' };

  const data = sheet.getDataRange().getValues();
  const searchStr = String(invoiceNo).replace(/^'/, '').trim();

  for (let i = 1; i < data.length; i++) {
    const rowInv = String(data[i][1]).replace(/^'/, '').trim();
    if (rowInv === searchStr) {
      return {
        found: true,
        invoiceDate: formatDate(data[i][0]),
        invoiceNo: rowInv,
        customerName: data[i][2],
        billingAddress: data[i][3],
        stateCode: data[i][4],
        shippingAddress: data[i][5],
        poDetails: data[i][6],
        poDate: formatDate(data[i][7]),
        gstNo: data[i][8],
        finalGrandTotal: data[i][9],
        itemsJson: data[i][11],
        remark: data[i].length > 12 ? data[i][12] : ''
      };
    }
  }

  return { found: false, error: 'Invoice not found' };
}

function formatDate(dateObj) {
  if (!dateObj) return '';
  try {
    const d = new Date(dateObj);
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d - offset).toISOString().slice(0, 10);
  } catch (e) {
    return '';
  }
}

function saveInvoice(formObject) {
  try {
    const ss = SpreadsheetApp.openById(SHEET_ID);
    let sheet = ss.getSheetByName(ENTRY_SHEET_NAME);

    if (!sheet) {
      sheet = ss.insertSheet(ENTRY_SHEET_NAME);
      sheet.appendRow([
        'Date', 'Invoice No', 'Customer', 'Bill Addr', 'State Code', 'Ship Addr', 'PO No', 'PO Date',
        'GST No', 'Total Amount', 'PDF Link', 'Items_JSON', 'Remark'
      ]);
    }

    const items = JSON.parse(formObject.itemsJson || '[]');
    const pdfUrl = createInvoicePDF(formObject, items);

    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;
    const targetInv = String(formObject.invoiceNo || '').replace(/^'/, '').trim();

    for (let i = 1; i < data.length; i++) {
      const existingInv = String(data[i][1] || '').replace(/^'/, '').trim();
      if (existingInv === targetInv) {
        rowIndex = i + 1;
        break;
      }
    }

    const rowData = [
      formObject.invoiceDate || '',
      "'" + targetInv,
      formObject.customerName || '',
      formObject.billingAddress || '',
      formObject.stateCode || '',
      formObject.shippingAddress || '',
      formObject.poDetails || '',
      formObject.poDate || '',
      formObject.gstNo || '',
      formObject.finalGrandTotal || '',
      pdfUrl,
      formObject.itemsJson || '[]',
      formObject.remark || ''
    ];

    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
      return { success: true, message: 'Invoice Updated & PDF Generated!', url: pdfUrl };
    }

    sheet.appendRow(rowData);
    return { success: true, message: 'Invoice Created!', url: pdfUrl };
  } catch (e) {
    return { success: false, error: e.toString() };
  }
}

function createInvoicePDF(data, items) {
  let itemsHtml = '';
  let grandTotal = 0;
  let totalCGST = 0;
  let totalSGST = 0;
  let totalIGST = 0;

  items.forEach(function(item, i) {
    const qty = parseFloat(item.qty) || 0;
    const unitPrice = parseFloat(item.unitPrice) || 0;
    const discountPercent = parseFloat(item.discountPercent) || 0;

    const discountAmount = unitPrice * (discountPercent / 100);
    const basicPrice = unitPrice - discountAmount;
    const taxableValue = basicPrice * qty;

    const igstRate = parseFloat(item.igst) || 0;
    const cgstRate = parseFloat(item.cgst) || 0;
    const sgstRate = parseFloat(item.sgst) || 0;

    const igstAmt = taxableValue * (igstRate / 100);
    const cgstAmt = taxableValue * (cgstRate / 100);
    const sgstAmt = taxableValue * (sgstRate / 100);

    grandTotal += taxableValue + igstAmt + cgstAmt + sgstAmt;
    totalIGST += igstAmt;
    totalCGST += cgstAmt;
    totalSGST += sgstAmt;

    itemsHtml += `
      <tr>
        <td style="text-align:center;">${i + 1}</td>
        <td>${item.desc || ''}</td>
        <td style="text-align:center;">${item.hsn || ''}</td>
        <td style="text-align:center;">${qty}</td>
        <td style="text-align:right;">${unitPrice.toFixed(2)}</td>
        <td style="text-align:right;">${discountAmount.toFixed(2)} <br><small>(${discountPercent}%)</small></td>
        <td style="text-align:right;">${basicPrice.toFixed(2)}</td>
        <td style="text-align:right;">${taxableValue.toFixed(2)}</td>
        <td style="text-align:center; font-size:10px;">
          ${igstRate > 0 ? 'IGST ' + igstRate + '%<br>' + igstAmt.toFixed(2) : ''}
          ${cgstRate > 0 ? 'CGST ' + cgstRate + '%<br>' + cgstAmt.toFixed(2) : ''}
          ${sgstRate > 0 ? 'SGST ' + sgstRate + '%<br>' + sgstAmt.toFixed(2) : ''}
        </td>
        <td style="text-align:right;">${(taxableValue + igstAmt + cgstAmt + sgstAmt).toFixed(2)}</td>
      </tr>
    `;
  });

  const amountInWords = convertNumberToWords(Math.round(grandTotal));
  const invDate = data.invoiceDate ? new Date(data.invoiceDate).toLocaleDateString('en-GB') : '';
  const poDate = data.poDate ? new Date(data.poDate).toLocaleDateString('en-GB') : '';

  const html = `
    <html>
      <head>
        <style>
          body { font-family: Arial, sans-serif; font-size: 10px; color: #000; }
          .header { text-align: center; margin-bottom: 10px; }
          .header h1 { color: #d32f2f; margin: 0; font-size: 22px; font-weight: bold; }
          .header p { margin: 2px 0; font-size: 11px; }
          .gst-header { font-weight: bold; font-size: 12px; margin-top: 5px; }
          table { width: 100%; border-collapse: collapse; margin-top: 5px; }
          th, td { border: 1px solid #000; padding: 4px; vertical-align: middle; }
          th { background-color: #f2f2f2; text-align: center; font-weight: bold; }
          .no-border td { border: none; }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>SUNRISE HEAVY MACHINE SERVICE</h1>
          <p>RAM VATIKA, 132, DADRI, GAUTAM BUDDHA NAGAR</p>
          <p>Tel: 9958549552 | Email: sunrise7480@rediffmail.com</p>
          <p class="gst-header">GST NO: 09AURPM1904AZZR</p>
          <h3 style="text-decoration: underline; margin: 5px 0;">TAX INVOICE</h3>
        </div>
        <table style="width:100%;">
          <tr>
            <td style="width:50%;">
              <strong>Bill To:</strong><br>
              <b>${data.customerName || ''}</b><br>${data.billingAddress || ''}<br>
              State Code: ${data.stateCode || ''}<br>GSTIN: ${data.gstNo || ''}
            </td>
            <td style="width:50%;">
              <table class="no-border" style="width:100%; margin:0;">
                <tr><td><strong>Invoice No:</strong></td><td>${data.invoiceNo || ''}</td></tr>
                <tr><td><strong>Date:</strong></td><td>${invDate}</td></tr>
                <tr><td><strong>PO No:</strong></td><td>${data.poDetails || ''}</td></tr>
                <tr><td><strong>PO Date:</strong></td><td>${poDate}</td></tr>
              </table>
            </td>
          </tr>
          <tr><td colspan="2"><strong>Ship To:</strong> ${data.shippingAddress ? data.shippingAddress : 'Same as Bill To'}</td></tr>
        </table>

        <table>
          <thead>
            <tr>
              <th width="4%">S.No</th><th width="25%">Description</th><th width="8%">HSN</th><th width="5%">Qty</th>
              <th width="10%">Rate</th><th width="8%">Disc</th><th width="10%">Basic</th><th width="10%">Taxable</th><th width="10%">GST</th><th width="10%">Total</th>
            </tr>
          </thead>
          <tbody>${itemsHtml}</tbody>
          <tfoot>
            <tr style="background-color: #f9f9f9; font-weight: bold;">
              <td colspan="9" style="text-align: right; padding-right: 10px;">GRAND TOTAL</td>
              <td style="text-align: right;">${grandTotal.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>

        <div style="border: 1px solid #000; border-top: none; padding: 5px; font-weight: bold;">
          Invoice Value in Words: ${amountInWords} ONLY
        </div>

        <table style="margin-top: 10px;">
          <tr>
            <td style="width: 50%; border-right: 1px solid #000; vertical-align: bottom;"><strong>TAX DETAIL</strong></td>
            <td style="width: 50%; padding: 0;">
              <table style="width: 100%; margin: 0; border: none;">
                <tr><td style="border: none; border-bottom: 1px solid #000; text-align: right;">CGST Amount</td><td style="border: none; border-bottom: 1px solid #000; text-align: right;">${totalCGST.toFixed(2)}</td></tr>
                <tr><td style="border: none; border-bottom: 1px solid #000; text-align: right;">SGST Amount</td><td style="border: none; border-bottom: 1px solid #000; text-align: right;">${totalSGST.toFixed(2)}</td></tr>
                <tr><td style="border: none; text-align: right;">IGST Amount</td><td style="border: none; text-align: right;">${totalIGST.toFixed(2)}</td></tr>
              </table>
            </td>
          </tr>
        </table>

        <table style="margin-top: 0;">
          <tr>
            <td style="width: 50%; vertical-align: top;"><strong>Declaration:</strong><br>We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.</td>
            <td style="width: 50%; vertical-align: top;">
              <strong>Company's Bank Details:</strong><br>
              Bank Name: BANK OF INDIA<br>A/c No: 714020110000182<br>Branch & IFS Code: BKID0007140, DADRI
            </td>
          </tr>
        </table>

        <div style="margin-top: 30px; text-align: right;"><p>For SUNRISE HEAVY MACHINE SERVICE</p><br><br><p>(Authorized Signatory)</p></div>
        <div style="text-align: center; margin-top: 30px; border-top: 1px solid #ccc; padding-top: 10px; font-size: 10px; color: #666;">
          This is a system generated invoice.
        </div>
      </body>
    </html>
  `;

  const blob = Utilities.newBlob(html, 'text/html', 'invoice.html');
  const pdfBlob = blob.getAs('application/pdf').setName('Invoice_' + (data.invoiceNo || 'NA') + '.pdf');
  const file = DriveApp.getFolderById(FOLDER_ID).createFile(pdfBlob);
  return file.getUrl();
}

function convertNumberToWords(num) {
  const a = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const b = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function inWords(n) {
    if (n < 20) return a[n];
    if (n < 100) return b[Math.floor(n / 10)] + (n % 10 ? ' ' + a[n % 10] : '');
    if (n < 1000) return a[Math.floor(n / 100)] + ' Hundred' + (n % 100 ? ' ' + inWords(n % 100) : '');
    if (n < 100000) return inWords(Math.floor(n / 1000)) + ' Thousand' + (n % 1000 ? ' ' + inWords(n % 1000) : '');
    if (n < 10000000) return inWords(Math.floor(n / 100000)) + ' Lakh' + (n % 100000 ? ' ' + inWords(n % 100000) : '');
    return inWords(Math.floor(n / 10000000)) + ' Crore' + (n % 10000000 ? ' ' + inWords(n % 10000000) : '');
  }

  if (!num || isNaN(num)) return 'Zero';
  return inWords(num);
}
