const express = require("express");
const PDFServicesSdk = require("@adobe/pdfservices-node-sdk");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const { execSync } = require("child_process");
const archiver = require("archiver");

const app = express();
const port = 3000;

// Define directories for temporary file storage
const pdfDirectory = path.join(__dirname, "pdf"); // PDF files directory
const pptxDirectory = path.join(__dirname, "pptx"); // PPTX files directory

// Ensure the directories exist, or create them if they don't
fs.promises.mkdir(pdfDirectory, { recursive: true }).catch(console.error);
fs.promises.mkdir(pptxDirectory, { recursive: true }).catch(console.error);

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

app.use("/", express.static(path.join(__dirname, "../client/public")));
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "client", "index.html"));
});

// Define the route for PDF conversion
app.post("/convert", upload.single("pdfFile"), async (req, res) => {
  // Check if a file was uploaded
  if (!req.file) {
    res.status(400).send("Please select a PDF file for conversion.");
    return;
  }
  const inputBuffer = req.file.buffer; // Get the file data from the request
  const image_editable = req.body.images_edit === "true"; // Access the checkbox value
  const non_text = req.body.non_text === "true"; // Access the checkbox value
  const download_images = req.body.download_images === "true"; // Access the checkbox value
  //console.log(`1: ${image_editable}, 2: ${download_images}`)
  const unique = `${Date.now()}_${Math.floor(Math.random() * 1000)}`; // Generate unique name for file

  // Generate a unique filename for temporary storage
  const uniquePDF = `pdf_${unique}`;
  const uniqueFilename = `${uniquePDF}.pdf`;
  const pdfFilePath = path.join(pdfDirectory, uniqueFilename);

  // Write the uploaded PDF file to the 'pdf' directory
  try {
    await fs.promises.writeFile(pdfFilePath, inputBuffer);
  } catch (err) {
    console.error("Error while saving the PDF file:", err);
    res.status(500).send("Error occurred during PDF file save.");
    return;
  }

  const responseDirectory = path.join(__dirname, "pptx", `${uniquePDF}`); // Response files directory
  await fs.promises.mkdir(responseDirectory, { recursive: true }); // Check  if Response directory is present //added await may cause error

  // Executes python script blocks js code execution till then
  const python_image_edit = () => {
    try {
      console.log("Image Edit Running");
      const result = execSync(
        `python editortry.py ${uniquePDF} ${download_images}`
      );
      console.log(`Python script output: ${result.toString()}`);
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }
  };

  const cnn_convert = () => {
    try {
      console.log("CNN Convert Running");
      const result = execSync(
        `python cnn_convertor.py ${uniquePDF} ${download_images}`
      );
      console.log(`Python script output: ${result.toString()}`);
    } catch (error) {
      console.error(`Error: ${error.message}`);
    }
    try {
      const pptxFilename = `pptx_${unique}.pptx`;
      const pptxFilePath = path.join(responseDirectory, pptxFilename);
      const target_repo = responseDirectory;
      const zip_repo = path.join(pptxDirectory, `${uniquePDF}.zip`); // Creates a zip folder
      const output = fs.createWriteStream(zip_repo);

      //Sets Response Headers
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=${uniquePDF}.zip`
      );

      // Create a new archive
      const archive = archiver("zip", {
        zlib: { level: 9 }, // Set compression level (optional)
      });

      // Pipe the output stream to the archive
      archive.pipe(output);

      // Add the source folder and its contents to the archive
      archive.directory(target_repo, false);

      // Finalize the archive and save it to the output ZIP file
      archive.finalize();

      // Listen for the archive to finish
      archive.on("end", async () => {
        try {
          const zipFileBuffer = fs.createReadStream(zip_repo);
          zipFileBuffer.pipe(res); // Sends zipped folder to client as response
          console.log("Pipe created");

          // Executes once client recieves the folder
          res.on("finish", () => {
            console.log("deleteion started");
            fs.promises
              .unlink(zip_repo) // Removes Zip folder
              .catch((zipUnlinkError) => {
                console.error(
                  `Error while unlinking ZIP file: ${zipUnlinkError.message}`
                );
              });
            fs.promises
              .unlink(pdfFilePath) // Removes PDF
              .catch((zipUnlinkError) => {
                console.error(
                  `Error while unlinking pdf file: ${zipUnlinkError.message}`
                );
              });
            // fs.promises
            //   .unlink(pptxFilePath) // Removes PPT
            //   .catch((zipUnlinkError) => {
            //     console.error(
            //       `Error while unlinking ppt file: ${zipUnlinkError.message}`
            //     );
            //   });
            fs.promises
              .rm(responseDirectory, { recursive: true }) // Removes Response Directory
              .catch((zipUnlinkError) => {
                console.error(
                  `Error while unlinking dir file: ${zipUnlinkError.message}`
                );
              });
          });
        } catch (err) {
          // Handles Zip download errros
          console.error("Error during ZIP file download:", err);
          res.status(500).send("Error occurred during ZIP file download.");
        }
      });

      // Handle zip file creation errors
      archive.on("error", (err) => {
        console.error("Error during ZIP archive creation:", err);
        res.status(500).send("Error occurred during ZIP archive creation.");
      });

      // Handles PDF Conversion errors
    } catch (err) {
      console.error("Error:", err);
      res.status(500).send("Error occurred during PDF conversion.");
    }
  };

  const adobe_convert = async () => {
    // Set up your Adobe PDF Services credentials
    const credentials =
      PDFServicesSdk.Credentials.servicePrincipalCredentialsBuilder()
        .withClientId(process.env.ClientId)
        .withClientSecret(process.env.ClientSecret)
        .build();

    const executionContext =
      PDFServicesSdk.ExecutionContext.create(credentials);

    // Create an ExportPDF operation for PPTX conversion
    const exportPdfOperation = PDFServicesSdk.ExportPDF.Operation.createNew(
      PDFServicesSdk.ExportPDF.SupportedTargetFormats.PPTX
    );

    // Set input from the uploaded PDF file
    const inputPDF = PDFServicesSdk.FileRef.createFromLocalFile(pdfFilePath);
    exportPdfOperation.setInput(inputPDF);

    // Generate a unique filename for the converted PPTX file
    const pptxFilename = `pptx_${unique}.pptx`;
    const pptxFilePath = path.join(responseDirectory, pptxFilename);

    try {
      const result = await exportPdfOperation.execute(executionContext); // Recieves converted PPT
      await result.saveAsFile(pptxFilePath); // Saves incoming ppt to local storage

      const target_repo = responseDirectory;
      const zip_repo = path.join(pptxDirectory, `${uniquePDF}.zip`); // Creates a zip folder
      const output = fs.createWriteStream(zip_repo);

      //Sets Response Headers
      res.setHeader("Content-Type", "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=${uniquePDF}.zip`
      );

      // Create a new archive
      const archive = archiver("zip", {
        zlib: { level: 9 }, // Set compression level (optional)
      });

      // Pipe the output stream to the archive
      archive.pipe(output);

      // Add the source folder and its contents to the archive
      archive.directory(target_repo, false);

      // Finalize the archive and save it to the output ZIP file
      archive.finalize();

      // Listen for the archive to finish
      archive.on("end", async () => {
        try {
          const zipFileBuffer = fs.createReadStream(zip_repo);
          zipFileBuffer.pipe(res); // Sends zipped folder to client as response
          console.log("Pipe created");

          // Executes once client recieves the folder
          res.on("finish", () => {
            console.log("deleteion started");
            fs.promises
              .unlink(zip_repo) // Removes Zip folder
              .catch((zipUnlinkError) => {
                console.error(
                  `Error while unlinking ZIP file: ${zipUnlinkError.message}`
                );
              });
            fs.promises
              .unlink(pdfFilePath) // Removes PDF
              .catch((zipUnlinkError) => {
                console.error(
                  `Error while unlinking pdf file: ${zipUnlinkError.message}`
                );
              });
            fs.promises
              .unlink(pptxFilePath) // Removes PPT
              .catch((zipUnlinkError) => {
                console.error(
                  `Error while unlinking ppt file: ${zipUnlinkError.message}`
                );
              });
            fs.promises
              .rm(responseDirectory, { recursive: true }) // Removes Response Directory
              .catch((zipUnlinkError) => {
                console.error(
                  `Error while unlinking dir file: ${zipUnlinkError.message}`
                );
              });
          });
        } catch (err) {
          // Handles Zip download errros
          console.error("Error during ZIP file download:", err);
          res.status(500).send("Error occurred during ZIP file download.");
        }
      });

      // Handle zip file creation errors
      archive.on("error", (err) => {
        console.error("Error during ZIP archive creation:", err);
        res.status(500).send("Error occurred during ZIP archive creation.");
      });

      // Handles PDF Conversion errors
    } catch (err) {
      console.error("Error:", err);
      res.status(500).send("Error occurred during PDF conversion.");
    }
  };

  if (image_editable) {
    python_image_edit();
  } //setTimeout(python,5000)}
  if (non_text) {
    cnn_convert();
  } else {
    //return res.status(200)
    await adobe_convert();
  } //setTimeout(convert, 5000)
});

// Start the Express.js server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
