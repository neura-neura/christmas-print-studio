import AppKit
import SceneKit
import UniformTypeIdentifiers
import simd

struct Adjustment: Codable {
    var scale: Double = 100
    var x: Double = 0
    var y: Double = 0
}
struct Design: Codable {
    var model = "sphere"
    var nameOnlyAdjust = Adjustment()
    var name = "Lupita"
    var bow = true
    var left = false
    var right = false
    var nameAdjust = Adjustment()
    var bowAdjust = Adjustment()
    var leftAdjust = Adjustment()
    var rightAdjust = Adjustment()
    enum CodingKeys:String,CodingKey {case model,nameOnlyAdjust,name,bow,left,right,nameAdjust,bowAdjust,leftAdjust,rightAdjust}
    init() {}
    init(from decoder:Decoder) throws {
        let c=try decoder.container(keyedBy:CodingKeys.self)
        model=try c.decodeIfPresent(String.self,forKey:.model) ?? "sphere"
        name=try c.decodeIfPresent(String.self,forKey:.name) ?? "Lupita"
        bow=try c.decodeIfPresent(Bool.self,forKey:.bow) ?? true
        left=try c.decodeIfPresent(Bool.self,forKey:.left) ?? false
        right=try c.decodeIfPresent(Bool.self,forKey:.right) ?? false
        nameOnlyAdjust=try c.decodeIfPresent(Adjustment.self,forKey:.nameOnlyAdjust) ?? Adjustment()
        nameAdjust=try c.decodeIfPresent(Adjustment.self,forKey:.nameAdjust) ?? Adjustment()
        bowAdjust=try c.decodeIfPresent(Adjustment.self,forKey:.bowAdjust) ?? Adjustment()
        leftAdjust=try c.decodeIfPresent(Adjustment.self,forKey:.leftAdjust) ?? Adjustment()
        rightAdjust=try c.decodeIfPresent(Adjustment.self,forKey:.rightAdjust) ?? Adjustment()
    }

}

final class Engine {
    private let process = Process()
    private let input = Pipe()
    private let output = Pipe()
    private var buffer = Data()
    var reply: (([String:Any])->Void)?
    init() throws {
        process.executableURL = Bundle.main.resourceURL!.appendingPathComponent("Engine/SphereEngine")
        process.arguments = ["--server"]
        process.standardInput = input
        process.standardOutput = output
        process.standardError = FileHandle.nullDevice
        output.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let bytes=handle.availableData
            guard !bytes.isEmpty else { return }
            DispatchQueue.main.async { self?.receive(bytes) }
        }
        process.terminationHandler = { [weak self] _ in
            DispatchQueue.main.async { self?.reply?(["error":"No se pudo continuar. Cierra y vuelve a abrir Esferas."]) }
        }
        try process.run()
    }
    private func receive(_ bytes:Data) {
        buffer.append(bytes)
        while let newline=buffer.firstIndex(of:10) {
            let line=Data(buffer[..<newline]);buffer.removeSubrange(...newline)
            if let value=try? JSONSerialization.jsonObject(with:line) as? [String:Any] {reply?(value)}
        }
    }
    func send(_ value:[String:Any]) {
        guard var data=try? JSONSerialization.data(withJSONObject:value) else{return}
        data.append(10)
        do { try input.fileHandleForWriting.write(contentsOf:data) }
        catch { reply?(["error":"No se pudo actualizar la esfera."]) }
    }
    func stop() { process.terminationHandler=nil;output.fileHandleForReading.readabilityHandler=nil;try? input.fileHandleForWriting.close();if process.isRunning {process.terminate()} }
}

final class AdjustmentRow: NSView {
    let slider:NSSlider
    let number=NSTextField(string:"0")
    let stepper=NSStepper()
    init(title:String,min:Double,max:Double,tag:Int,target:AnyObject) {
        slider=NSSlider(value:0,minValue:min,maxValue:max,target:nil,action:nil)
        super.init(frame:.zero)
        let label=NSTextField(labelWithString:title);label.font = .systemFont(ofSize:12)
        slider.isContinuous=true;slider.target=target;slider.action=#selector(Controller.adjustSlider(_:));slider.tag=tag
        number.alignment = .right;number.font = .monospacedDigitSystemFont(ofSize:12,weight:.regular);number.tag=tag
        number.target=target;number.action=#selector(Controller.adjustNumber(_:))
        number.delegate=target as? NSTextFieldDelegate
        stepper.minValue=min;stepper.maxValue=max;stepper.increment=tag==0 ? 1 : 0.1;stepper.tag=tag
        stepper.target=target;stepper.action=#selector(Controller.adjustStepper(_:))
        let line=NSStackView(views:[label,number,stepper]);line.spacing=6;line.alignment = .centerY
        let stack=NSStackView(views:[line,slider]);stack.orientation = .vertical;stack.alignment = .leading;stack.spacing=5
        stack.translatesAutoresizingMaskIntoConstraints=false;addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo:leadingAnchor),stack.trailingAnchor.constraint(equalTo:trailingAnchor),stack.topAnchor.constraint(equalTo:topAnchor),stack.bottomAnchor.constraint(equalTo:bottomAnchor),label.widthAnchor.constraint(equalToConstant:131),number.widthAnchor.constraint(equalToConstant:70),slider.widthAnchor.constraint(equalTo:stack.widthAnchor)])
    }
    required init?(coder:NSCoder){fatalError()}
    func set(_ value:Double) {slider.doubleValue=value;stepper.doubleValue=value;number.stringValue=String(format:slider.tag==0 ? "%.0f" : "%.1f",value)}
}

final class Controller:NSObject, NSApplicationDelegate, NSTextFieldDelegate, NSToolbarDelegate {
    var window:NSWindow!
    let nameField=NSTextField(string:"Lupita")
    let bow=NSButton(checkboxWithTitle:"Moño",target:nil,action:nil)
    let left=NSButton(checkboxWithTitle:"Copo izquierdo",target:nil,action:nil)
    let right=NSButton(checkboxWithTitle:"Copo derecho",target:nil,action:nil)
    let selection=NSPopUpButton()
    let modelPicker=NSPopUpButton()
    let nameGroup=NSStackView()
    let elementsGroup=NSStackView()
    let adjustmentGroup=NSStackView()
    let dimensions=NSTextField(labelWithString:"")
    let cameraModes=NSSegmentedControl(labels:["Frontal","3D"],trackingMode:.selectOne,target:nil,action:nil)
    var cameraCenter=SCNVector3(2.3,0,0)
    var cameraScale:Double=66
    var fittedKey=""
    let view=SCNView()
    let status=NSTextField(wrappingLabelWithString:"")
    let spinner=NSProgressIndicator()
    let saveButton=NSButton(title:"Guardar…",target:nil,action:nil)
    let bambuButton=NSButton(title:"Abrir en Bambu Studio",target:nil,action:nil)
    var rows:[AdjustmentRow]=[]
    var design=Design()
    var engine:Engine?
    var revision=0
    var busy=false
    var debounce:DispatchWorkItem?
    var currentFile:URL?
    var draftRoot:URL!
    var nodes:[SCNNode]=[]
    let camera=SCNNode()
    var inspecting=false

    func applicationDidFinishLaunching(_ notification:Notification) {
        NSApp.setActivationPolicy(.regular)
        draftRoot=FileManager.default.temporaryDirectory.appendingPathComponent("Esferas/Drafts/"+UUID().uuidString,isDirectory:true)
        try? FileManager.default.createDirectory(at:draftRoot,withIntermediateDirectories:true)
        cleanOldTemporaryFiles()
        window=NSWindow(contentRect:NSRect(x:0,y:0,width:1030,height:820),styleMask:[.titled,.closable,.miniaturizable,.resizable],backing:.buffered,defer:false)
        window.title="Esferas";window.subtitle="Esfera con nombre";window.contentMinSize=NSSize(width:920,height:760);window.center()
        let toolbar=NSToolbar(identifier:"Main");toolbar.delegate=self;toolbar.displayMode = .iconOnly;window.toolbar=toolbar;window.toolbarStyle = .unified
        buildContent();buildMenu();setupScene();window.setContentSize(NSSize(width:1030,height:820))
        do {engine=try Engine();engine?.reply={ [weak self] in self?.received($0) }} catch {status.stringValue="No se pudo iniciar el editor."}
        window.makeKeyAndOrderFront(nil);window.makeFirstResponder(nameField);NSApp.activate(ignoringOtherApps:true)
        changed()
    }
    func toolbarAllowedItemIdentifiers(_ toolbar:NSToolbar)->[NSToolbarItem.Identifier] { [.init("open"),.flexibleSpace,.init("save"),.init("bambu")] }
    func toolbarDefaultItemIdentifiers(_ toolbar:NSToolbar)->[NSToolbarItem.Identifier] {toolbarAllowedItemIdentifiers(toolbar)}
    func toolbar(_ toolbar:NSToolbar,itemForItemIdentifier id:NSToolbarItem.Identifier,willBeInsertedIntoToolbar:Bool)->NSToolbarItem? {
        let item=NSToolbarItem(itemIdentifier:id)
        if id.rawValue=="open" {let b=NSButton(image:NSImage(systemSymbolName:"folder",accessibilityDescription:"Abrir proyecto")!,target:self,action:#selector(openProject));b.bezelStyle = .texturedRounded;item.view=b;item.label="Abrir";item.toolTip="Abrir un proyecto guardado"}
        else if id.rawValue=="save" {saveButton.target=self;saveButton.action=#selector(save);saveButton.bezelStyle = .texturedRounded;saveButton.image=NSImage(systemSymbolName:"square.and.arrow.down",accessibilityDescription:nil);saveButton.imagePosition = .imageLeading;item.view=saveButton;item.label="Guardar"}
        else if id.rawValue=="bambu" {bambuButton.target=self;bambuButton.action=#selector(openBambu);bambuButton.bezelStyle = .texturedRounded;item.view=bambuButton;item.label="Bambu Studio"}
        else {return nil}
        return item
    }
    func buildContent() {
        let root=window.contentView!
        root.widthAnchor.constraint(greaterThanOrEqualToConstant:920).isActive=true
        root.heightAnchor.constraint(greaterThanOrEqualToConstant:760).isActive=true
        let sidebar=NSVisualEffectView();sidebar.material = .sidebar;sidebar.blendingMode = .behindWindow
        sidebar.translatesAutoresizingMaskIntoConstraints=false;root.addSubview(sidebar)
        let separator=NSBox();separator.boxType = .separator;separator.translatesAutoresizingMaskIntoConstraints=false;root.addSubview(separator)
        view.translatesAutoresizingMaskIntoConstraints=false;root.addSubview(view)
        NSLayoutConstraint.activate([sidebar.leadingAnchor.constraint(equalTo:root.leadingAnchor),sidebar.topAnchor.constraint(equalTo:root.topAnchor),sidebar.bottomAnchor.constraint(equalTo:root.bottomAnchor),sidebar.widthAnchor.constraint(equalToConstant:300),separator.leadingAnchor.constraint(equalTo:sidebar.trailingAnchor),separator.widthAnchor.constraint(equalToConstant:1),separator.topAnchor.constraint(equalTo:root.topAnchor),separator.bottomAnchor.constraint(equalTo:root.bottomAnchor),view.leadingAnchor.constraint(equalTo:separator.trailingAnchor),view.trailingAnchor.constraint(equalTo:root.trailingAnchor),view.topAnchor.constraint(equalTo:root.topAnchor),view.bottomAnchor.constraint(equalTo:root.bottomAnchor)])
        nameField.font = .systemFont(ofSize:20);nameField.placeholderString="Nombre";nameField.delegate=self;nameField.tag=99
        nameField.heightAnchor.constraint(equalToConstant:34).isActive=true
        for button in [bow,left,right] {button.target=self;button.action=#selector(toggle);button.state = button===bow ? .on : .off}
        selection.addItems(withTitles:["Nombre","Moño","Copo izquierdo","Copo derecho"]);selection.target=self;selection.action=#selector(selectPart)
        rows=[AdjustmentRow(title:"Tamaño (%)",min:25,max:150,tag:0,target:self),AdjustmentRow(title:"Horizontal (mm)",min:-20,max:20,tag:1,target:self),AdjustmentRow(title:"Vertical (mm)",min:-20,max:20,tag:2,target:self)]
        modelPicker.addItems(withTitles:["Esfera con nombre","Esfera con foto","Nombre solo","Patita con nombre","Ratoncito con moño"]);modelPicker.target=self;modelPicker.action=#selector(modelChanged)
        let reset=NSButton(title:"Restablecer ajuste",target:self,action:#selector(resetPart));reset.bezelStyle = .rounded
        cameraModes.target=self;cameraModes.action=#selector(cameraMode(_:));cameraModes.selectedSegment=0
        nameGroup.addArrangedSubview(heading("Nombre"));nameGroup.addArrangedSubview(nameField)
        for v in [heading("Elementos"),bow,left,right] {elementsGroup.addArrangedSubview(v)}
        for v in [heading("Ajustar pieza"),selection,rows[0],rows[1],rows[2],reset] {adjustmentGroup.addArrangedSubview(v)}
        for group in [nameGroup,elementsGroup,adjustmentGroup] {group.orientation = .vertical;group.alignment = .leading;group.spacing=9;group.detachesHiddenViews=true}
        dimensions.font = .monospacedDigitSystemFont(ofSize:11,weight:.regular);dimensions.textColor = .secondaryLabelColor
        let stack=NSStackView(views:[heading("Modelo"),modelPicker,space(8),nameGroup,space(6),elementsGroup,space(6),adjustmentGroup,space(8),cameraModes,dimensions])
        stack.orientation = .vertical;stack.alignment = .leading;stack.spacing=7;stack.translatesAutoresizingMaskIntoConstraints=false
        sidebar.addSubview(stack)
        NSLayoutConstraint.activate([stack.leadingAnchor.constraint(equalTo:sidebar.leadingAnchor,constant:20),stack.trailingAnchor.constraint(equalTo:sidebar.trailingAnchor,constant:-20),stack.topAnchor.constraint(equalTo:sidebar.topAnchor,constant:20)])
        for v in [modelPicker,nameGroup,elementsGroup,adjustmentGroup,nameField,selection,cameraModes] {v.widthAnchor.constraint(equalTo:stack.widthAnchor).isActive=true}
        for r in rows {r.widthAnchor.constraint(equalTo:stack.widthAnchor).isActive=true}
        status.font = .systemFont(ofSize:11);status.textColor = .secondaryLabelColor;status.translatesAutoresizingMaskIntoConstraints=false;sidebar.addSubview(status)
        spinner.style = .spinning;spinner.controlSize = .small;spinner.isDisplayedWhenStopped=false;spinner.translatesAutoresizingMaskIntoConstraints=false;sidebar.addSubview(spinner)
        NSLayoutConstraint.activate([status.leadingAnchor.constraint(equalTo:sidebar.leadingAnchor,constant:20),status.trailingAnchor.constraint(equalTo:sidebar.trailingAnchor,constant:-40),status.bottomAnchor.constraint(equalTo:sidebar.bottomAnchor,constant:-18),spinner.trailingAnchor.constraint(equalTo:sidebar.trailingAnchor,constant:-17),spinner.centerYAnchor.constraint(equalTo:status.centerYAnchor)])
        refreshMode();setExportEnabled(false)
    }
    func heading(_ title:String)->NSTextField {let l=NSTextField(labelWithString:title);l.font = .systemFont(ofSize:12,weight:.semibold);l.textColor = .secondaryLabelColor;return l}
    func space(_ height:CGFloat)->NSView {let v=NSView();v.heightAnchor.constraint(equalToConstant:height).isActive=true;return v}
    func buildMenu() {
        let menu=NSMenu();let appItem=NSMenuItem();menu.addItem(appItem);let appMenu=NSMenu();appItem.submenu=appMenu
        appMenu.addItem(withTitle:"Acerca de Esferas",action:#selector(about),keyEquivalent:"").target=self;appMenu.addItem(.separator());appMenu.addItem(withTitle:"Salir de Esferas",action:#selector(NSApplication.terminate(_:)),keyEquivalent:"q")
        let file=NSMenuItem();file.title="Archivo";menu.addItem(file);let fm=NSMenu(title:"Archivo");file.submenu=fm
        fm.addItem(withTitle:"Abrir…",action:#selector(openProject),keyEquivalent:"o").target=self
        fm.addItem(withTitle:"Guardar…",action:#selector(save),keyEquivalent:"s").target=self
        let edit=NSMenuItem();edit.title="Edición";menu.addItem(edit);let em=NSMenu(title:"Edición");edit.submenu=em
        for (title,action,key) in [("Deshacer",Selector(("undo:")),"z"),("Cortar",#selector(NSText.cut(_:)),"x"),("Copiar",#selector(NSText.copy(_:)),"c"),("Pegar",#selector(NSText.paste(_:)),"v"),("Seleccionar todo",#selector(NSText.selectAll(_:)),"a")] {em.addItem(withTitle:title,action:action,keyEquivalent:key)}
        NSApp.mainMenu=menu
    }
    func setupScene() {
        let scene=SCNScene();view.scene=scene;view.backgroundColor=NSColor(calibratedWhite:0.93,alpha:1);view.antialiasingMode = .multisampling4X;view.allowsCameraControl=true;view.autoenablesDefaultLighting=false
        camera.camera=SCNCamera();camera.camera?.usesOrthographicProjection=true;camera.camera?.orthographicScale=66;camera.camera?.zNear=0.1;camera.camera?.zFar=1000;scene.rootNode.addChildNode(camera);view.pointOfView=camera
        let ambient=SCNNode();ambient.light=SCNLight();ambient.light?.type = .ambient;ambient.light?.intensity=120;scene.rootNode.addChildNode(ambient)
        let sun=SCNNode();sun.light=SCNLight();sun.light?.type = .directional;sun.light?.intensity=650;sun.eulerAngles=SCNVector3(-0.3,-0.4,0);scene.rootNode.addChildNode(sun)
        setCamera(false)
    }
    func setCamera(_ threeD:Bool) {
        let c=cameraCenter
        camera.position=threeD ? SCNVector3(c.x+100,c.y-150,c.z+350) : SCNVector3(c.x,c.y,c.z+400)
        camera.camera?.orthographicScale=cameraScale
        camera.look(at:c,up:SCNVector3(0,1,0),localFront:SCNVector3(0,0,-1));view.pointOfView=camera
    }
    @objc func cameraMode(_ sender:NSSegmentedControl){setCamera(sender.selectedSegment==1)}
    @objc func modelChanged(){design.model=["sphere","photo","name","paw","mouse"][modelPicker.indexOfSelectedItem];fittedKey="";refreshMode();changed()}
    func refreshMode() {
        modelPicker.selectItem(at:["sphere","photo","name","paw","mouse"].firstIndex(of:design.model) ?? 0)
        nameGroup.isHidden=design.model=="photo";elementsGroup.isHidden=design.model != "sphere";adjustmentGroup.isHidden=design.model=="photo"
        let custom=["paw","mouse"].contains(design.model)
        selection.isHidden=design.model != "sphere";rows[1].isHidden=design.model != "sphere" && !custom;rows[2].isHidden=design.model != "sphere" && !custom
        if custom {selection.selectItem(at:0)}
        if design.model=="mouse" {selection.isHidden=false;selection.item(at:2)?.isHidden=true;selection.item(at:3)?.isHidden=true;elementsGroup.isHidden=false;left.isHidden=true;right.isHidden=true}else{selection.item(at:2)?.isHidden=false;selection.item(at:3)?.isHidden=false;left.isHidden=false;right.isHidden=false}
        rows[0].slider.maxValue=design.model=="name" ? 100 : 150;rows[0].stepper.maxValue=rows[0].slider.maxValue
        window.subtitle=modelPicker.titleOfSelectedItem ?? ""
        refreshRows()
    }
    var adjustment:Adjustment {
        get {if design.model=="name" {return design.nameOnlyAdjust};switch selection.indexOfSelectedItem {case 1:return design.bowAdjust;case 2:return design.leftAdjust;case 3:return design.rightAdjust;default:return design.nameAdjust}}
        set {if design.model=="name" {design.nameOnlyAdjust=newValue;return};switch selection.indexOfSelectedItem {case 1:design.bowAdjust=newValue;case 2:design.leftAdjust=newValue;case 3:design.rightAdjust=newValue;default:design.nameAdjust=newValue}}
    }
    func refreshRows(){let a=adjustment;for (r,v) in zip(rows,[a.scale,a.x,a.y]){r.set(v)}}
    @objc func selectPart(){refreshRows()}
    @objc func resetPart(){adjustment=Adjustment();refreshRows();changed()}
    @objc func toggle(){design.bow=bow.state == .on;design.left=left.state == .on;design.right=right.state == .on;changed()}
    @objc func adjustSlider(_ sender:NSSlider){applyAdjustment(sender.tag,sender.doubleValue)}
    @objc func adjustStepper(_ sender:NSStepper){applyAdjustment(sender.tag,sender.doubleValue)}
    @objc func adjustNumber(_ sender:NSTextField){guard let v=Double(sender.stringValue.replacingOccurrences(of:",",with:".")) else{return};applyAdjustment(sender.tag,v)}
    func applyAdjustment(_ tag:Int,_ value:Double,refresh:Bool=true){var a=adjustment;switch tag {case 0:a.scale=min(design.model=="name" ? 100 : 150,max(25,value));case 1:a.x=min(20,max(-20,value));default:a.y=min(20,max(-20,value))};adjustment=a;if refresh {refreshRows()};changed()}
    func controlTextDidChange(_ notification:Notification) {
        guard let field=notification.object as? NSTextField else{return}
        if field===nameField {design.name=field.stringValue;changed()}
        else if let value=Double(field.stringValue.replacingOccurrences(of:",",with:".")){applyAdjustment(field.tag,value,refresh:false)}
    }
    func changed() {
        revision+=1;currentFile=nil;setExportEnabled(false);debounce?.cancel()
        guard design.model=="photo" || !design.name.trimmingCharacters(in:.whitespacesAndNewlines).isEmpty else{status.stringValue="Escribe un nombre.";return}
        status.stringValue="Actualizando…";spinner.startAnimation(nil)
        let task=DispatchWorkItem { [weak self] in self?.schedule() };debounce=task;DispatchQueue.main.asyncAfter(deadline:.now()+0.18,execute:task)
    }
    func schedule() {
        guard !busy,let data=try? JSONEncoder().encode(design),let settings=try? JSONSerialization.jsonObject(with:data) else{return}
        busy=true
        let out=draftRoot.appendingPathComponent("draft-\(revision).3mf")
        engine?.send(["id":revision,"settings":settings,"out":out.path])
    }
    func received(_ result:[String:Any]) {
        if inspecting { inspecting=false;busy=false
            if let settings=result["settings"],let data=try? JSONSerialization.data(withJSONObject:settings),let loaded=try? JSONDecoder().decode(Design.self,from:data) {design=loaded;nameField.stringValue=design.name;refreshMode();fittedKey="";bow.state=design.bow ? .on : .off;left.state=design.left ? .on : .off;right.state=design.right ? .on : .off;refreshRows();changed()}
            else{status.stringValue="Este 3MF no contiene un proyecto de Esferas.";spinner.stopAnimation(nil)}
            return
        }
        busy=false
        if let id=result["id"] as? Int,id != revision {schedule();return}
        spinner.stopAnimation(nil)
        if let error=result["error"] as? String {status.stringValue=error;setExportEnabled(false);return}
        if let size=result["sizeMM"] as? [Double],size.count==3 {dimensions.stringValue=String(format:"%.2f × %.2f × %.2f cm",size[0]/10,size[1]/10,size[2]/10)}
        if let path=result["preview"] as? String {loadMesh(URL(fileURLWithPath:path))}
        if result["connected"] as? Bool == true,let path=result["file"] as? String {currentFile=URL(fileURLWithPath:path);status.stringValue="";setExportEnabled(true)}
        else{status.stringValue=result["message"] as? String ?? "Revisa las uniones.";setExportEnabled(false)}
        cleanDrafts()
    }
    func loadMesh(_ url:URL) {
        guard let data=try? Data(contentsOf:url),let parts=try? JSONSerialization.jsonObject(with:data) as? [[String:Any]] else{return}
        nodes.forEach{$0.removeFromParentNode()};nodes=[]
        var allVertices:[[Double]]=[]
        for part in parts {
            if let points=part["vertices"] as? [[Double]] {allVertices.append(contentsOf:points)}
            guard let vertices=part["vertices"] as? [[Double]],let faces=part["faces"] as? [[Int]] else{continue}
            var points:[SCNVector3]=[];var normals:[SCNVector3]=[]
            for f in faces {
                let a=SIMD3<Float>(Float(vertices[f[0]][0]),Float(vertices[f[0]][1]),Float(vertices[f[0]][2]))
                let b=SIMD3<Float>(Float(vertices[f[1]][0]),Float(vertices[f[1]][1]),Float(vertices[f[1]][2]))
                let c=SIMD3<Float>(Float(vertices[f[2]][0]),Float(vertices[f[2]][1]),Float(vertices[f[2]][2]))
                let cross=simd_cross(b-a,c-a);let n=simd_length(cross)>0.0000001 ? simd_normalize(cross) : SIMD3<Float>(0,0,1)
                points.append(contentsOf:[SCNVector3(a),SCNVector3(b),SCNVector3(c)])
                normals.append(contentsOf:Array(repeating:SCNVector3(n),count:3))
            }
            let sources=[SCNGeometrySource(vertices:points),SCNGeometrySource(normals:normals)]
            let element=SCNGeometryElement(indices:(0..<points.count).map{Int32($0)},primitiveType:.triangles)
            let geometry=SCNGeometry(sources:sources,elements:[element]);let material=SCNMaterial();material.diffuse.contents=NSColor(calibratedWhite:0.7,alpha:1);material.lightingModel = .lambert;geometry.materials=[material]
            let node=SCNNode(geometry:geometry);node.name=part["name"] as? String;view.scene?.rootNode.addChildNode(node);nodes.append(node)
        }
        let key=design.model+":"+design.name
        if !allVertices.isEmpty && fittedKey != key {
            let low=(0..<3).map{axis in allVertices.map{$0[axis]}.min()!};let high=(0..<3).map{axis in allVertices.map{$0[axis]}.max()!}
            cameraCenter=SCNVector3((low[0]+high[0])/2,(low[1]+high[1])/2,(low[2]+high[2])/2)
            let aspect=max(0.3,Double(view.bounds.width/max(1,view.bounds.height)))
            cameraScale=max(12,max((high[1]-low[1])/2,(high[0]-low[0])/(2*aspect)))*1.16
            fittedKey=key;setCamera(cameraModes.selectedSegment==1)
        }
    }
    func setExportEnabled(_ enabled:Bool){saveButton.isEnabled=enabled;bambuButton.isEnabled=enabled}
    @objc func save() {
        guard let file=currentFile else{return}
        let panel=NSSavePanel();panel.title="Guardar modelo";panel.nameFieldStringValue=outputName();panel.allowedContentTypes=[UTType(filenameExtension:"3mf") ?? .data];panel.canCreateDirectories=true
        panel.beginSheetModal(for:window) { response in
            guard response == .OK,let destination=panel.url else{return}
            do {let data=try Data(contentsOf:file);try data.write(to:destination,options:.atomic)}catch{self.alert("No se pudo guardar",error.localizedDescription)}
        }
    }
    @objc func openBambu() {
        guard let file=currentFile else{return}
        let folder=FileManager.default.temporaryDirectory.appendingPathComponent("Esferas/Bambu/"+UUID().uuidString,isDirectory:true)
        let copy=folder.appendingPathComponent(outputName())
        do{try FileManager.default.createDirectory(at:folder,withIntermediateDirectories:true);try FileManager.default.copyItem(at:file,to:copy)}catch{alert("No se pudo abrir",error.localizedDescription);return}
        let app=NSWorkspace.shared.urlForApplication(withBundleIdentifier:"com.bambulab.bambu-studio") ?? URL(fileURLWithPath:"/Applications/BambuStudio.app")
        NSWorkspace.shared.open([copy],withApplicationAt:app,configuration:NSWorkspace.OpenConfiguration()) {_,error in if let error=error {DispatchQueue.main.async{self.alert("No se pudo abrir Bambu Studio",error.localizedDescription)}}}
    }
    @objc func openProject() {
        guard !busy else{return}
        let panel=NSOpenPanel();panel.allowedContentTypes=[UTType(filenameExtension:"3mf") ?? .data];panel.allowsMultipleSelection=false
        panel.beginSheetModal(for:window) {response in guard response == .OK,let url=panel.url else{return};self.busy=true;self.inspecting=true;self.spinner.startAnimation(nil);self.engine?.send(["command":"inspect","file":url.path])}
    }
    @objc func about(){NSApp.orderFrontStandardAboutPanel(options:[.applicationName:"Esferas",.applicationVersion:"2.4",.credits:NSAttributedString(string:"Cream Cake Bold · Ef Studio\nFuente incluida para uso personal.")])}
    func outputName()->String {
        if design.model=="photo" {return "Esfera_con_foto.3mf"}
        return (design.model=="name" ? "Nombre_" : "Esfera_")+safeName()+".3mf"
    }
    func safeName()->String{String(design.name.map{$0.isLetter || $0.isNumber ? $0 : "_"}.prefix(50))}
    func alert(_ title:String,_ detail:String){let a=NSAlert();a.messageText=title;a.informativeText=detail;a.beginSheetModal(for:window)}
    func cleanDrafts(){let urls=(try? FileManager.default.contentsOfDirectory(at:draftRoot,includingPropertiesForKeys:nil)) ?? [];for url in urls where !url.lastPathComponent.hasPrefix("draft-\(revision)."){try? FileManager.default.removeItem(at:url)}}
    func cleanOldTemporaryFiles(){let root=FileManager.default.temporaryDirectory.appendingPathComponent("Esferas/Bambu");for url in (try? FileManager.default.contentsOfDirectory(at:root,includingPropertiesForKeys:[.creationDateKey])) ?? [] {if let date=(try? url.resourceValues(forKeys:[.creationDateKey]))?.creationDate,Date().timeIntervalSince(date)>604800 {try? FileManager.default.removeItem(at:url)}}}
    func applicationWillTerminate(_ notification:Notification){engine?.stop();try? FileManager.default.removeItem(at:draftRoot)}
    func applicationShouldTerminateAfterLastWindowClosed(_ sender:NSApplication)->Bool {true}
}
let app=NSApplication.shared
let controller=Controller()
app.delegate=controller
app.run()
