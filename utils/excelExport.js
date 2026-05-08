const ExcelJS = require("exceljs");

const buildParticipantsWorkbook = async (participants) => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Participants");

  sheet.columns = [
    { header: "Name", key: "name", width: 24 },
    { header: "ID / Email", key: "identity", width: 24 },
    { header: "Branch", key: "branch", width: 22 },
    { header: "Designation", key: "designation", width: 20 },
    { header: "Class", key: "class", width: 16 },
    { header: "Score", key: "score", width: 12 },
    { header: "Result", key: "result", width: 12 },
    { header: "Date", key: "date", width: 22 }
  ];

  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1A3A66" }
  };
  sheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

  participants.forEach((participant) => {
    const row = sheet.addRow({
      name: participant.name,
      identity: participant.identity,
      branch: participant.branch,
      designation: participant.designation,
      class: participant.class,
      score: `${participant.score}/${participant.totalQuestions}`,
      result: participant.result,
      date: new Date(participant.date).toLocaleString("en-IN")
    });

    const isPass = String(participant.result).toLowerCase() === "pass";

    row.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: isPass ? "FFE8F5E9" : "FFFFEBEE" }
    };

    row.font = {
      color: { argb: isPass ? "FF1B5E20" : "FFB71C1C" }
    };
  });

  sheet.eachRow((row) => {
    row.eachCell((cell) => {
      cell.border = {
        top: { style: "thin", color: { argb: "FFD5D5D5" } },
        left: { style: "thin", color: { argb: "FFD5D5D5" } },
        bottom: { style: "thin", color: { argb: "FFD5D5D5" } },
        right: { style: "thin", color: { argb: "FFD5D5D5" } }
      };
      cell.alignment = { vertical: "middle", horizontal: "left", wrapText: true };
    });
  });

  return workbook.xlsx.writeBuffer();
};

module.exports = {
  buildParticipantsWorkbook
};
