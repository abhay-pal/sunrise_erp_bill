// ============================
// SUNRISE INVOICE API (GAS)
// ============================
// Update these constants with your sheet + drive folder IDs.
const SHEET_ID = '1B31AbcRfXsaONDWzxhBQEmU1hTPeIcz_nHicCQcdwOw';
const FOLDER_ID = '15SOXm9CbyeIFxpvjVmlmSorutpPYsHGN';

function doGet(e) {
  try {
    const action = (e && e.parameter && e.parameter.action) || '';
    if (!action) {
      return jsonResponse({ success: true, message: 'Sunrise invoice API is running.' });
    }

    if (action === 'initial-data') {
      return jsonResponse({ success: true, data: getInitialData() });
    }

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
    const action = payload.action || '';

    if (action === 'save-invoice') {
      return jsonResponse({ success: true, data: saveInvoice(payload) });
    }

    return jsonResponse({ success: false, error: 'Invalid action.' });
  } catch (error) {
    return jsonResponse({ success: false, error: error.toString() });
  }
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

function getInitialData() {
  const ss = SpreadsheetApp.openById(SHEET_ID);

  let products = [];
  const dropSheet = ss.getSheetByName('Drop_down');
  if (dropSheet && dropSheet.getLastRow() >= 2) {
    products = dropSheet.getRange(2, 1, dropSheet.getLastRow() - 1, 4).getValues();
  }

  let invoices = [];
  let nextInvoiceNo = 'SUN-001';

  const entrySheet = ss.getSheetByName('Data_entry');
  if (entrySheet && entrySheet.getLastRow() >= 2) {
    const rawData = entrySheet.getRange(2, 2, entrySheet.getLastRow() - 1, 1).getValues();
    invoices = rawData.flat().filter(String).map(String);
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
  const sheet = ss.getSheetByName('Data_entry');
  if (!sheet) return { found: false, error: 'Sheet not found' };

  const data = sheet.getDataRange().getValues();
  const searchStr = String(invoiceNo).trim();

  for (let i = 1; i < data.length; i++) {
    const rowInv = String(data[i][1]).trim();
    if (rowInv === searchStr) {
      let remarkVal = data[i].length > 12 ? data[i][12] : '';
      return {
        found: true,
        invoiceDate: formatDate(data[i][0]),
        invoiceNo: data[i][1],
        customerName: data[i][2],
        billingAddress: data[i][3],
        stateCode: data[i][4],
        shippingAddress: data[i][5],
        poDetails: data[i][6],
        poDate: formatDate(data[i][7]),
        gstNo: data[i][8],
        finalGrandTotal: data[i][9],
        itemsJson: data[i][11],
        remark: remarkVal
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
    let sheet = ss.getSheetByName('Data_entry');

    if (!sheet) {
      sheet = ss.insertSheet('Data_entry');
      sheet.appendRow(['Date', 'Invoice No', 'Customer', 'Bill Addr', 'State Code', 'Ship Addr', 'PO No', 'PO Date', 'GST No', 'Total Amount', 'PDF Link', 'Items_JSON', 'Remark']);
    }

    const items = JSON.parse(formObject.itemsJson);
    const pdfUrl = createInvoicePDF(formObject, items);

    const data = sheet.getDataRange().getValues();
    let rowIndex = -1;
    const targetInv = String(formObject.invoiceNo).trim();

    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]).trim() === targetInv) {
        rowIndex = i + 1;
        break;
      }
    }

    const rowData = [
      formObject.invoiceDate,
      "'" + formObject.invoiceNo,
      formObject.customerName,
      formObject.billingAddress,
      formObject.stateCode,
      formObject.shippingAddress,
      formObject.poDetails,
      formObject.poDate,
      formObject.gstNo,
      formObject.finalGrandTotal,
      pdfUrl,
      formObject.itemsJson,
      formObject.remark
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

  items.forEach((item, i) => {
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
        <td>${item.desc}</td>
        <td style="text-align:center;">${item.hsn}</td>
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
  const invDate = new Date(data.invoiceDate).toLocaleDateString('en-GB');
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
              <b>${data.customerName}</b><br>${data.billingAddress}<br>
              State Code: ${data.stateCode}<br>GSTIN: ${data.gstNo}
            </td>
            <td style="width:50%;">
              <table class="no-border" style="width:100%; margin:0;">
                <tr><td><strong>Invoice No:</strong></td><td>${data.invoiceNo}</td></tr>
                <tr><td><strong>Date:</strong></td><td>${invDate}</td></tr>
                <tr><td><strong>PO No:</strong></td><td>${data.poDetails}</td></tr>
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

  const fileName = 'Invoice_' + data.invoiceNo + '.pdf';
  const blob = Utilities.newBlob(html, 'text/html', fileName);
  const file = DriveApp.getFolderById(FOLDER_ID).createFile(blob.getAs('application/pdf'));
  return file.getUrl();
}

function convertNumberToWords(amount) {
  var words = new Array();
  words[0] = ''; words[1] = 'One'; words[2] = 'Two'; words[3] = 'Three'; words[4] = 'Four'; words[5] = 'Five'; words[6] = 'Six'; words[7] = 'Seven'; words[8] = 'Eight'; words[9] = 'Nine'; words[10] = 'Ten';
  words[11] = 'Eleven'; words[12] = 'Twelve'; words[13] = 'Thirteen'; words[14] = 'Fourteen'; words[15] = 'Fifteen'; words[16] = 'Sixteen'; words[17] = 'Seventeen'; words[18] = 'Eighteen'; words[19] = 'Nineteen'; words[20] = 'Twenty';
  words[30] = 'Thirty'; words[40] = 'Forty'; words[50] = 'Fifty'; words[60] = 'Sixty'; words[70] = 'Seventy'; words[80] = 'Eighty'; words[90] = 'Ninety';
  amount = amount.toString();
  var atemp = amount.split('.');
  var number = atemp[0].split(',').join('');
  var n_length = number.length;
  var words_string = '';
  if (n_length <= 9) {
    var n_array = new Array(0, 0, 0, 0, 0, 0, 0, 0, 0);
    var received_n_array = new Array();
    for (var i = 0; i < n_length; i++) { received_n_array[i] = number.substr(i, 1); }
    for (var i = 9 - n_length, j = 0; i < 9; i++, j++) { n_array[i] = received_n_array[j]; }
    for (var i = 0, j = 1; i < 9; i++, j++) {
      if (i == 0 || i == 2 || i == 4 || i == 7) {
        if (n_array[i] == 1) {
          n_array[j] = 10 + parseInt(n_array[j]);
          n_array[i] = 0;
        }
      }
    }
    var value = '';
    for (var i = 0; i < 9; i++) {
      if (i == 0 || i == 2 || i == 4 || i == 7) { value = n_array[i] * 10; } else { value = n_array[i]; }
      if (value != 0) { words_string += words[value] + ' '; }
      if ((i == 1 && value != 0) || (i == 0 && value != 0 && n_array[i + 1] == 0)) { words_string += 'Crore '; }
      if ((i == 3 && value != 0) || (i == 2 && value != 0 && n_array[i + 1] == 0)) { words_string += 'Lakh '; }
      if ((i == 5 && value != 0) || (i == 4 && value != 0 && n_array[i + 1] == 0)) { words_string += 'Thousand '; }
      if (i == 6 && value != 0 && (n_array[i + 1] != 0 && n_array[i + 2] != 0)) { words_string += 'Hundred and '; } else if (i == 6 && value != 0) { words_string += 'Hundred '; }
    }
    words_string = words_string.split('  ').join(' ');
  }
  return words_string.toUpperCase() + ' RUPEES';
}
