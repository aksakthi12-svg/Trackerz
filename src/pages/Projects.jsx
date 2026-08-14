import { useState } from "react";

function Projects() {
  const [showForm, setShowForm] = useState(false);

  const [projectName, setProjectName] = useState("");
  const [clientName, setClientName] = useState("");
  const [panels, setPanels] = useState("");
  const [status, setStatus] = useState("Production");

  const [projects, setProjects] = useState([
    {
      id: 1,
      name: "Arun Interiors",
      client: "Arun Kumar",
      panels: 184,
      status: "Production",
    },
    {
      id: 2,
      name: "ABC Residence",
      client: "Mr. Kumar",
      panels: 96,
      status: "Cutting",
    },
    {
      id: 3,
      name: "XYZ Villa",
      client: "XYZ",
      panels: 320,
      status: "Completed",
    },
  ]);

  const handleSaveProject = (e) => {
    e.preventDefault();

    if (!projectName.trim() || !clientName.trim() || !panels) {
      alert("Please fill in all project details.");
      return;
    }

    const newProject = {
      id: Date.now(),
      name: projectName.trim(),
      client: clientName.trim(),
      panels: Number(panels),
      status,
    };

    setProjects((prevProjects) => [...prevProjects, newProject]);

    // Clear form
    setProjectName("");
    setClientName("");
    setPanels("");
    setStatus("Production");
    setShowForm(false);
  };

  const handleCancel = () => {
    setProjectName("");
    setClientName("");
    setPanels("");
    setStatus("Production");
    setShowForm(false);
  };

  return (
    <div className="projects-page">
      <div className="projects-header">
        <div>
          <h1>Projects</h1>
          <p>Manage your interior production projects</p>
        </div>

        {!showForm && (
          <button
            className="primary-btn"
            onClick={() => setShowForm(true)}
          >
            + New Project
          </button>
        )}
      </div>

      {showForm && (
        <div className="project-form-card">
          <div className="form-header">
            <div>
              <h2>New Project</h2>
              <p>Add a new interior production project</p>
            </div>

            <button
              className="close-btn"
              onClick={handleCancel}
              type="button"
            >
              ×
            </button>
          </div>

          <form onSubmit={handleSaveProject}>
            <div className="form-grid">
              <div className="form-group">
                <label>Project Name</label>
                <input
                  type="text"
                  placeholder="Project Name"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Client Name</label>
                <input
                  type="text"
                  placeholder="Client Name"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Number of Panels</label>
                <input
                  type="number"
                  min="1"
                  placeholder="Number of Panels"
                  value={panels}
                  onChange={(e) => setPanels(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label>Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="Production">Production</option>
                  <option value="Cutting">Cutting</option>
                  <option value="Pending">Pending</option>
                  <option value="Completed">Completed</option>
                </select>
              </div>
            </div>

            <div className="form-actions">
              <button className="primary-btn" type="submit">
                Save Project
              </button>

              <button
                className="secondary-btn"
                type="button"
                onClick={handleCancel}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="projects-card">
        <div className="projects-table">
          <div className="table-header">
            <span>Project</span>
            <span>Client</span>
            <span>Panels</span>
            <span>Status</span>
          </div>

          {projects.map((project) => (
            <div className="table-row" key={project.id}>
              <span className="project-name">
                {project.name}
              </span>

              <span>{project.client}</span>

              <span>{project.panels}</span>

              <span>
                <span
                  className={`status status-${project.status
                    .toLowerCase()
                    .replace(/\s+/g, "-")}`}
                >
                  {project.status}
                </span>
              </span>
            </div>
          ))}

          {projects.length === 0 && (
            <div className="empty-projects">
              No projects found.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default Projects;