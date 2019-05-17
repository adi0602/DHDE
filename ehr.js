/*
	Put file description here
*/

const request = require('request');
const fs = require('fs');
const path = require('path');
const readlineSync = require('readline-sync');
var menu = require('node-menu');
var Table = require('cli-table');
const ls = require('log-symbols');

const {
	PORT,
	ehr_id,
	HIE_IP,
	CLINIC_ID,
	EHR_PORT,
} = require('./config');

const ehr_store_dir = "./ehr_store";
const ehr_ret_dir = path.join(ehr_store_dir, 'from_blockchain');
const url = `http://${HIE_IP}:${PORT}/api/documents`;


/**Menu
 */
function UploadFile(){
	const filename = readlineSync.question("Enter name of the file to upload: ");
	const filepath = `./ehr_store/${filename}`;
	
	const doc_id = readlineSync.question("Enter doctor id of the uploader: ");
	// let temp = readlineSync.question("Is this the final document to be shared (Y/N): ");
	// const is_final_document = (temp.toLowerCase() === 'y')? true : false;
	const is_final_document = true;				// hard coded for now

	// Adding query params
	temp = (is_final_document === true)? "true" : "false";		// booleans not allowed on query params, hence passing it as a string
	const url_with_params = `${url}?doc_id=${doc_id}&is_final_document=${temp}`;

	let req = request.post(url_with_params, function handleResponse(err, resp, body) {
		if (err) {
			console.log(`Error while sending post request: ${err}`);
		}
		else {
			if (resp.statusCode === 400	|| resp.statusCode === 422 || resp.statusCode === 500 || resp.statusCode !== 200) {
				const err_msg = body;
				console.log(resp.statusCode + ": Error in received response");
				console.log(err_msg);
			}
			else {
				const res_obj = JSON.parse(body);
				console.log(ls.success, "CCDA successfully uploaded to HIE");
				console.log(ls.info, "Asset created on blockchain is:")
				console.log(res_obj);
			}
		}
	});

	console.log(doc_id, is_final_document);

	const form = req.form();
	form.append('file', fs.createReadStream(filepath));

	// Not passing in form as it is tedious to handle in busboy, passing as query params
	// form.append('doc_id', doc_id);
	// form.append('is_final_document', is_final_document);			// boolean in json?
}	
function GetPatientInfo(){
	console.log("Please enter patient information. Press enter to skip");
	const query = {};
	query.FirstName = readlineSync.question("Enter first_name of patient: ");
	query.LastName = readlineSync.question("Enter last_name of patient: ");
	query.Country = readlineSync.question("Enter country of patient: ");
	query.SSN = readlineSync.question("Enter ssn of patient: ");
	query.DocId = readlineSync.question("Enter Id of doctor: ");
	query.DocName = readlineSync.question("Enter name of doctor: ");
	query.Reason = readlineSync.question("Enter Reason for Access: ");
	
	
	// sending a get request with the query params
	request({url:url, qs: query}, function(err, resp, body) {
		if (err)
			console.log(`Error: ${err}`);
		else {
			if (resp.statusCode == 404 || resp.statusCode == 400 || resp.statusCode == 409 || resp.statusCode !== 200)
				console.log(body);
			else {
				// To Refactor
				const parser = require('xml2json');
				const options = { object: true };
				// console.log(typeof body);		// string, not file descriptor
				const json = parser.toJson(body, options);
				const patInfo = json.ClinicalDocument.recordTarget.patientRole;
				const pat_name_obj = patInfo.patient.name;
				const pat_name = pat_name_obj.given + pat_name_obj.family;

				fs.writeFile(path.join(__dirname, ehr_ret_dir, pat_name+'.xml'), body, function(err, data) {
					if (err)
						console.log(err);
					else {
						console.log(`Successfully recieved requested data & written to file ${pat_name}`);
					}
				});
			}
		}
	});
}	

menu.customHeader(function() {
    process.stdout.write(`\nDATA EXCHANGE PLATFORM for ${CLINIC_ID}\n`);
})
menu.customPrompt(function() {
    process.stdout.write("Enter choice: \n");
})
menu.addDelimiter('-', 40, 'Main Menu')
.addItem(
	'Upload File',
	UploadFile
)
.addItem(
	'Request File',
	GetPatientInfo
)
.addDelimiter('*', 40)
.start();

//////////////////////////// Request CCDA webpage //////////////////////// 
const express = require('express');
const app = express();

// to refactor
app.set('view engine', 'ejs');

app.get('/uploadCCDA', (req, res) => {
	let render_obj = {};
	render_obj.network_port = PORT;
	if (HIE_IP === '0.0.0.0')							// In production, 1 clinic per PC				
		render_obj.network_ip = '192.168.31.131';		// send the IP from the DNS, e.g - 192.168.31.131	////
	else												// 127.x.x.x
		render_obj.network_ip = HIE_IP;

	res.render('uploadCCDA', render_obj);
});

app.get('/requestCCDA?', (req, res) => {
	// if no query params, then display the form
	if ( Object.keys(req.query).length === 0 ) {
		// Dynamic IP in the ejs template -
		let render_obj = {};
		render_obj.network_ehr_port = EHR_PORT;
		if (HIE_IP === '0.0.0.0')							// In production, 1 clinic per PC				
			render_obj.network_ip = '192.168.31.131';		// send the IP from the DNS, e.g - 192.168.31.131	//////
		else												// 127.x.x.x
			render_obj.network_ip = HIE_IP;

		res.render('requestCCDA', render_obj);
	} else {
		// Fetching form data from get request
		let get_url = url+'?';

		let i = 1;
		for (const key in req.query) {
			if (req.query[key].length) {
				if (i != 1) {
					get_url += "&"
				}
				get_url += `${key}=${req.query[key]}`;
				i++;
			}
		}
		console.log(get_url);

		request.get(get_url, function(err, resp, body) {
			if (err) {
				console.log(`Error: ${err}`);
				res.send(`Error: ${err}`);
			} else {
				if (resp.statusCode == 404 || resp.statusCode == 400 || resp.statusCode == 409 || resp.statusCode !== 200) {
					console.log(`${resp.statusCode}: ${err}`);
					res.send(`${resp.statusCode}: ${err}`);
				}
				else {
					// name of file = name of patient
					// Hence fetching name from the document
					const parser = require('xml2json');
					const options = { object: true };
					// console.log(typeof body);		// string, not file descriptor
					const json = parser.toJson(body, options);
					const patInfo = json.ClinicalDocument.recordTarget.patientRole;
					const pat_name_obj = patInfo.patient.name;
					const pat_name = pat_name_obj.given + pat_name_obj.family;
					console.log(pat_name);

					const abs_path = path.join(__dirname, ehr_ret_dir, pat_name+'.xml');
					fs.writeFile(abs_path, body, function(err, data) {
						if (err) {
							console.log(err);
							res.send(err);
						} else {
							console.log(ls.success, `Successfully recieved requested data & wrote file: ${pat_name}.xml to disk`);
							// console.log(body);
							// res.send(body);						///////////// xml
							const options = {}; // = { headers: { 'Content-Type': 'text/xml' } };
							res.sendFile(abs_path, options);		// convenient method
						}
					});
				}
			}
		});
	}
});

// app.listen(EHR_PORT, () => console.log(`Clinic: ${CLINIC_ID} is listening on ${HIE_IP}:${EHR_PORT} ...`));
const http = require('http');
const server = http.createServer(app);
server.listen(EHR_PORT, HIE_IP, () => console.log(`Client of clinic: ${CLINIC_ID} is listening on ${HIE_IP}:${EHR_PORT} ...`));

app.use('/static', express.static('static'));		// Xsl file